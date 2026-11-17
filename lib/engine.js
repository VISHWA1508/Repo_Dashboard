// Decision engine: turns live numbers into a suggested repo move and a written reasoning.
// Rule: required repo = expected inflation + neutral real rate + 0.25 x (growth - potential) + market stress.
// Suggested move = gap x pace, rounded to the nearest 25 bps, limited to +/-75 bps.
const r2 = (x) => Math.round(x * 100) / 100;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const last = (s) => (s && s.length ? s[s.length - 1].v : null);
const valueAgo = (s, days) => {
  if (!s || !s.length) return null;
  const cutoff = Date.now() - days * 864e5;
  let pick = s[0];
  for (const p of s) { if (new Date(p.d).getTime() <= cutoff) pick = p; else break; }
  return pick.v;
};
const pct = (a, b) => (a == null || b == null || b === 0 ? null : ((a - b) / b) * 100);
const sgn = (x, d = 2) => (x >= 0 ? '+' : '-') + Math.abs(x).toFixed(d);

function marketView(series) {
  const brent = last(series.brent), usd = last(series.usdinr);
  return {
    brent, brent_chg7: pct(brent, valueAgo(series.brent, 7)), brent_chg30: pct(brent, valueAgo(series.brent, 30)),
    usdinr: usd, usdinr_chg30: pct(usd, valueAgo(series.usdinr, 30)),
    ust10: last(series.ust10), fedfunds: last(series.fedfunds), in10y: last(series.in10y),
  };
}

// Extra caution (bps) from oil, rupee and US yields. Positive = more hawkish.
function stressBps(m) {
  const parts = []; let bps = 0;
  const add = (b, txt) => { if (b) { bps += b; parts.push({ bps: b, txt }); } };
  if (m.brent != null) add(m.brent >= 110 ? 25 : m.brent >= 95 ? 10 : m.brent <= 80 ? -10 : 0, 'Brent at $' + m.brent.toFixed(0));
  if (m.usdinr_chg30 != null) add(m.usdinr_chg30 >= 2 ? 15 : m.usdinr_chg30 <= -1.5 ? -10 : 0, 'rupee ' + (m.usdinr_chg30 >= 0 ? 'down ' : 'up ') + Math.abs(m.usdinr_chg30).toFixed(1) + '% in 30 days');
  if (m.ust10 != null) add(m.ust10 >= 5 ? 10 : 0, 'US 10-year yield at ' + m.ust10.toFixed(2) + '%');
  bps = Math.max(-25, Math.min(50, bps));
  return { bps, parts };
}

function run(i) {
  const required = i.expInf + i.neutral + 0.25 * (i.growth - i.potential) + i.stress / 100;
  const gap = required - i.repo;
  let move = Math.round((gap * i.pace) / 0.25) * 0.25;
  move = Math.max(-0.75, Math.min(0.75, move));
  return { required: r2(required), gap: r2(gap), move_bps: Math.round(move * 100), new_repo: r2(i.repo + move) };
}

function analyze(india, series) {
  const m = marketView(series);
  const st = stressBps(m);
  const p = india.rbi_projection, a = india.assumptions, c = india.cpi;
  const expInf = a.expected_inflation != null ? a.expected_inflation : r2(mean(p.cpi.slice(1)));
  const inp = { repo: india.policy.repo, expInf, neutral: a.neutral_real, growth: p.gdp_fy, potential: a.potential_growth, pace: a.pace, stress: st.bps };
  const d = run(inp);
  const realNow = r2(inp.repo - expInf), realAfter = r2(d.new_repo - expInf);

  const scen = [
    ['Base case (live inputs)', inp],
    ['Brent up $15', { ...inp, stress: stressBps({ ...m, brent: (m.brent || 95) + 15 }).bps }],
    ['Rupee falls 2% more', { ...inp, stress: stressBps({ ...m, usdinr_chg30: (m.usdinr_chg30 || 0) + 2 }).bps }],
    ['Food prices ease: inflation 0.5 pt lower', { ...inp, expInf: r2(expInf - 0.5) }],
    ['Growth scare: GDP 1 pt lower', { ...inp, growth: inp.growth - 1 }],
  ].map(([name, x]) => ({ name, ...run(x) }));

  const reasons = [], risks = [];
  const over = c.latest - c.upper_band;
  reasons.push(`Inflation: CPI is ${c.latest.toFixed(2)}%, ${over > 0 ? over.toFixed(2) + ' points above' : Math.abs(over).toFixed(2) + ' points below'} the ${c.upper_band}% upper limit. Food inflation is ${c.food.toFixed(2)}%.`);
  reasons.push(`Real rate: with the repo at ${inp.repo.toFixed(2)}% and inflation expected near ${expInf.toFixed(1)}%, the real repo rate is ${sgn(realNow)}%. The assumed neutral level is ${a.neutral_real.toFixed(1)}%, so policy is still ${realNow < a.neutral_real ? 'easier than neutral' : 'at or above neutral'}.`);
  reasons.push(`Growth: the RBI projects ${inp.growth}% for FY27 and the latest print is ${india.gdp.latest}% (${india.gdp.label}), ${inp.growth >= inp.potential ? 'above' : 'below'} the ${inp.potential}% potential rate. ${inp.growth >= inp.potential ? 'The economy can absorb a hike.' : 'A hike would weigh on growth.'}`);
  if (st.parts.length) reasons.push(`Markets: ${st.parts.map((x) => x.txt + ' (' + sgn(x.bps, 0) + ' bps)').join('; ')}. Net caution: ${sgn(st.bps, 0)} bps.`);
  else reasons.push('Markets: oil, rupee and US yields are in a normal range, so no extra caution is added.');
  if (india.pmi) reasons.push(`Activity: manufacturing PMI is ${india.pmi.manufacturing}${india.pmi.composite_flash ? ' and the flash composite PMI is ' + india.pmi.composite_flash : ''}; above 50 means expansion.`);

  if (m.brent != null) risks.push(`Oil: Brent is $${m.brent.toFixed(1)}${m.brent_chg7 != null ? ' (' + sgn(m.brent_chg7, 1) + '% in 7 days)' : ''}. A move above $110 adds 25 bps of caution.`);
  if (m.usdinr != null) risks.push(`Rupee: USD/INR is ${m.usdinr.toFixed(2)}${m.usdinr_chg30 != null ? ' (' + sgn(m.usdinr_chg30, 1) + '% in 30 days)' : ''}. Faster depreciation raises imported inflation.`);
  if (m.ust10 != null) risks.push(`US yields: the 10-year is at ${m.ust10.toFixed(2)}%${m.fedfunds != null ? ' and the Fed funds rate is ' + m.fedfunds.toFixed(2) + '%' : ''}. Higher US yields pull capital from emerging markets.`);
  risks.push('Food: onion, vegetable and cereal prices are weather-driven and can reverse quickly after the winter harvest.');

  const verb = d.move_bps > 0 ? `raise the repo rate by ${d.move_bps} bps to ${d.new_repo.toFixed(2)}%` : d.move_bps < 0 ? `cut the repo rate by ${Math.abs(d.move_bps)} bps to ${d.new_repo.toFixed(2)}%` : `hold the repo rate at ${inp.repo.toFixed(2)}%`;
  const headline = `On today's numbers the rule says: ${verb}.`;
  const narrative = [
    headline,
    `The required repo rate is ${d.required.toFixed(2)}% against ${inp.repo.toFixed(2)}% today, a gap of ${sgn(d.gap)} points. The committee usually closes about ${Math.round(inp.pace * 100)}% of such a gap per meeting, which gives ${d.move_bps >= 0 ? '+' : ''}${d.move_bps} bps after rounding.`,
    `After the move the real repo rate would be ${sgn(realAfter)}%${realAfter < a.neutral_real ? ', still below the neutral level, so a further hike stays possible.' : ', at or above neutral, so the case for more hikes weakens.'}`,
    scen.slice(1).some((x) => x.move_bps !== d.move_bps) ? 'The call changes if: ' + scen.slice(1).filter((x) => x.move_bps !== d.move_bps).map((x) => x.name.toLowerCase() + ' (' + (x.move_bps >= 0 ? '+' : '') + x.move_bps + ' bps)').join('; ') + '.' : 'The call holds under every shock tested below.',
  ];

  return { inputs: { ...inp, market: m, stress_parts: st.parts }, decision: { ...d, real_now: realNow, real_after: realAfter }, reasons, risks, scenarios: scen, narrative, headline };
}

module.exports = { analyze, marketView };

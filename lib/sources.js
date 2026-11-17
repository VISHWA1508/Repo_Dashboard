// Live market data. Every source fails on its own, so one bad API never blanks the dashboard.
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function getJSON(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'repo-dashboard/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// FRED (free key): https://fred.stlouisfed.org/docs/api/api_key.html
async function fred(id, key, days) {
  const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=' + id +
    '&api_key=' + encodeURIComponent(key) + '&file_type=json&observation_start=' + daysAgo(days);
  const j = await getJSON(url);
  return j.observations.filter((o) => o.value !== '.').map((o) => ({ d: o.date, v: parseFloat(o.value) }));
}

// USD/INR from Frankfurter (ECB reference rates, no key). Falls back to the older domain.
async function usdinr(days) {
  const path = '/' + daysAgo(days) + '..?base=USD&symbols=INR';
  let j;
  try { j = await getJSON('https://api.frankfurter.dev/v1' + path); }
  catch (e) { j = await getJSON('https://api.frankfurter.app' + path); }
  return Object.entries(j.rates).map(([d, r]) => ({ d, v: r.INR })).sort((a, b) => a.d.localeCompare(b.d));
}

// Deterministic fake data so you can test the pipeline offline (MOCK_DATA=1).
function mock(base, vol, n, seed) {
  let x = base, s = seed; const out = [];
  for (let i = n; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    x += ((s / 4294967296) - 0.5) * vol;
    out.push({ d: daysAgo(i), v: Math.round(x * 100) / 100 });
  }
  return out;
}

async function fetchMarket(env) {
  const key = env.FRED_API_KEY;
  const useMock = env.MOCK_DATA === '1';
  const series = {}; const status = {};
  const jobs = {
    usdinr: { label: 'USD/INR (Frankfurter, ECB)', run: () => (useMock ? Promise.resolve(mock(93.5, 0.5, 90, 7)) : usdinr(120)), needsKey: false },
    brent: { label: 'Brent crude, $/bbl (FRED DCOILBRENTEU)', run: () => (useMock ? Promise.resolve(mock(99, 3, 90, 3)) : fred('DCOILBRENTEU', key, 120)), needsKey: true },
    ust10: { label: 'US 10-yr Treasury yield, % (FRED DGS10)', run: () => (useMock ? Promise.resolve(mock(4.9, 0.06, 90, 5)) : fred('DGS10', key, 120)), needsKey: true },
    fedfunds: { label: 'US Fed funds rate, % (FRED FEDFUNDS)', run: () => (useMock ? Promise.resolve(mock(4.0, 0.0, 12, 9)) : fred('FEDFUNDS', key, 400)), needsKey: true },
    in10y: { label: 'India 10-yr yield, % monthly (FRED INDIRLTLT01STM)', run: () => (useMock ? Promise.resolve(mock(6.8, 0.05, 14, 11)) : fred('INDIRLTLT01STM', key, 500)), needsKey: true },
  };
  await Promise.all(Object.entries(jobs).map(async ([id, j]) => {
    if (j.needsKey && !key && !useMock) { status[id] = { ok: false, label: j.label, error: 'FRED_API_KEY missing in .env' }; return; }
    try {
      const data = await j.run();
      if (!data.length) throw new Error('empty response');
      series[id] = data;
      status[id] = { ok: true, label: j.label, asof: data[data.length - 1].d, mock: useMock };
    } catch (e) { status[id] = { ok: false, label: j.label, error: String(e.message || e) }; }
  }));
  return { series, status };
}

module.exports = { fetchMarket };

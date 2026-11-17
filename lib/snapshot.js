const { analyze } = require('./engine');
const { writeNote } = require('./llm');

function round(o) {
  const result = {};
  for (const key in o) result[key] = typeof o[key] === 'number' ? Math.round(o[key] * 100) / 100 : o[key];
  return result;
}

async function buildSnapshot({ env, india, market, marketAt, reason }) {
  const analysis = analyze(india, market.series);
  const facts = {
    policy: india.policy,
    cpi: { latest: india.cpi.latest, food: india.cpi.food, upper_band: india.cpi.upper_band },
    gdp: india.gdp,
    pmi: india.pmi,
    rbi_projection: india.rbi_projection,
    market: round(analysis.inputs.market),
    stress: analysis.inputs.stress_parts,
    decision: analysis.decision,
    scenarios: analysis.scenarios,
  };
  const llm = await writeNote(env, facts);
  return {
    generated_at: new Date().toISOString(),
    reason,
    market_fetched_at: marketAt,
    refresh_minutes: Math.max(5, parseInt(env.REFRESH_MINUTES, 10) || 15),
    mock: env.MOCK_DATA === '1',
    india,
    market: { series: market.series, status: market.status },
    analysis,
    llm: {
      text: llm.text,
      source: llm.source,
      error: llm.error,
      at: llm.at || null,
      enabled: !!env.GEMINI_API_KEY,
    },
  };
}

module.exports = { buildSnapshot };

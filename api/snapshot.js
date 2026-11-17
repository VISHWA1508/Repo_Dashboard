const { fetchMarket } = require('../lib/sources');
const { buildSnapshot } = require('../lib/snapshot');
const india = require('../data/india.json');

module.exports = async function handler(req, res) {
  const refreshMinutes = Math.max(5, parseInt(process.env.REFRESH_MINUTES, 10) || 15);

  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const market = await fetchMarket(process.env);
    const snapshot = await buildSnapshot({
      env: process.env,
      india,
      market,
      marketAt: new Date().toISOString(),
      reason: 'request',
    });
    res.setHeader('Cache-Control', 'public, s-maxage=' + refreshMinutes * 60 + ', stale-while-revalidate=300');
    return res.status(200).json(snapshot);
  } catch (error) {
    console.error('Snapshot generation failed:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Unable to load dashboard data. Check the Vercel function logs.' });
  }
};

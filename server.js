// Repo Rate Dashboard server. No npm packages needed (Node 18+).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./lib/env');
loadEnv();
const { fetchMarket } = require('./lib/sources');
const { buildSnapshot } = require('./lib/snapshot');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const REFRESH_MIN = Math.max(5, parseInt(process.env.REFRESH_MINUTES, 10) || 15);
const INDIA_FILE = path.join(__dirname, 'data', 'india.json');
const PUBLIC = path.join(__dirname, 'public');

let market = { series: {}, status: {} };
let marketAt = null;
let snapshot = null;
const clients = new Set();

function readIndia() { return JSON.parse(fs.readFileSync(INDIA_FILE, 'utf8')); }

async function rebuild(reason) {
  let india;
  try { india = readIndia(); } catch (e) { console.error('data/india.json is invalid:', e.message); return; }
  snapshot = await buildSnapshot({ env: process.env, india, market, marketAt, reason });
  const msg = 'data: ' + JSON.stringify({ type: 'update', at: snapshot.generated_at }) + '\n\n';
  for (const c of clients) c.write(msg);
  console.log(new Date().toLocaleTimeString(), 'snapshot rebuilt (' + reason + ') ->', analysis.headline);
}

async function refreshMarket(reason) {
  try { market = await fetchMarket(process.env); marketAt = new Date().toISOString(); }
  catch (e) { console.error('market refresh failed:', e.message); }
  await rebuild(reason);
}

// Watch the India data file: edit and save it and the dashboard updates within a second.
let t;
try { fs.watch(INDIA_FILE, () => { clearTimeout(t); t = setTimeout(() => rebuild('india.json changed'), 400); }); } catch (e) { /* ignore */ }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/snapshot') {
    res.writeHead(snapshot ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(snapshot || { error: 'warming up' }));
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 5000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, ready: !!snapshot })); }
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('Repo Rate Dashboard running at http://localhost:' + PORT);
  if (!process.env.FRED_API_KEY && process.env.MOCK_DATA !== '1') console.log('Note: FRED_API_KEY is empty, so Brent, US yields and India 10-yr will show as unavailable. See README.');
  refreshMarket('startup');
  setInterval(() => refreshMarket('scheduled refresh'), REFRESH_MIN * 60000);
});

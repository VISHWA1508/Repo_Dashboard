# Live Repo Rate Dashboard

A full-stack dashboard for the RBI repo rate decision. The server pulls live market data, reruns a transparent decision rule, writes the reasoning, and pushes updates to your browser automatically.

## Run it (5 minutes)

1. Install Node.js 18 or newer from nodejs.org (check with `node -v`). There is **nothing to `npm install`**.
2. Copy `.env.example` to `.env` and add your keys (see below).
3. Run `npm start` and open http://localhost:3000.

To test without any keys, run `npm run demo` (fake market data, clearly labelled as demo).

## API keys (all free)

| Key | Needed? | What it powers | Where to get it |
|---|---|---|---|
| `FRED_API_KEY` | Yes, for full live data | Brent crude, US 10-year yield, Fed funds rate, India 10-year yield | https://fredaccount.stlouisfed.org/apikeys (free, instant) |
| `GEMINI_API_KEY` | Optional | A written analyst note on top of the built-in reasoning | https://aistudio.google.com/apikey (free tier, no card) |

No key needed: USD/INR comes from Frankfurter (ECB rates).
The dashboard also writes its own reasoning with no key at all, so Gemini is a bonus. Free tiers have daily limits, so the server calls Gemini at most once every 30 minutes (`LLM_MIN_MINUTES`) and only to rewrite numbers it already computed.
The default model is `gemini-3.5-flash-lite`. Model names and availability can change; if Gemini returns an error, check `GEMINI_MODEL` in `.env` against the current models available in Google AI Studio.

Keys stay on the server in `.env`. They are never sent to the browser. `.env` is in `.gitignore`, so do not upload it to GitHub.

## What updates by itself, and what you update

**Automatic (every `REFRESH_MINUTES`, default 15):** USD/INR, Brent, US 10-year yield, Fed funds, India 10-year yield. The decision, the reasoning, the "what would change it" table and the charts rebuild after each refresh and appear in the browser without reloading.

**Manual, in `data/india.json`:** repo rate, CPI, GDP, PMI, RBI projections, reserves. The RBI and MoSPI publish no free API, so you update this file after each release (CPI on the 12th of each month, GDP every quarter, RBI policy every two months). **Save the file and the dashboard updates within a second.** The "Data freshness" table turns amber when a number is overdue.

## How the decision is made

```
required repo = expected inflation + neutral real rate + 0.25 x (growth - potential growth) + market caution
suggested move = (required repo - current repo) x pace, rounded to 25 bps, limited to +/-75 bps
```

- Expected inflation = average of the RBI's projected CPI for the next three quarters (or your override in `assumptions.expected_inflation`).
- Market caution (bps): Brent at $95+ adds 10, $110+ adds 25, $80 or less subtracts 10; rupee down 2%+ in 30 days adds 15; US 10-year at 5%+ adds 10.
- Change `neutral_real`, `potential_growth` and `pace` in `data/india.json` to test your own assumptions. Defaults: 1.0, 6.8 and 0.2.

This is a simplified teaching model, not the RBI's method. Say so in your interview and be ready to defend each assumption.

## Files

```
server.js          web server, refresh loop, live stream (SSE), file watcher
lib/sources.js     live market data (FRED, Frankfurter)
lib/engine.js      decision rule, scenarios, written reasoning
lib/llm.js         optional Gemini note
data/india.json    India figures you update after each release
public/            the dashboard page (index.html, app.js, style.css)
```

## Deploy to Vercel

Import the repository into Vercel and deploy with the project root as the root directory. Vercel serves the dashboard from `public/` and runs `api/snapshot.js` as a serverless function. In Project Settings → Environment Variables, add `FRED_API_KEY` and optionally `GEMINI_API_KEY`; do not upload `.env`. Redeploy after changing environment variables or `data/india.json`.

The hosted dashboard refreshes by polling the snapshot endpoint. Set `REFRESH_MINUTES` in Vercel to control the refresh interval (minimum 5 minutes). `MOCK_DATA=1` enables demo market data.

## Other hosting options

Render, Railway or Fly.io free plans can run this as a Node web service (start command `npm start`). Add `FRED_API_KEY` and `GEMINI_API_KEY` in the host's environment-variables screen instead of uploading `.env`. Free plans may sleep when idle, and free hosts reset files on redeploy, so edit `data/india.json` in your repo and redeploy to update it. Check each host's current free-plan limits.

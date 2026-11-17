// Optional: Google Gemini (free tier from Google AI Studio) rewrites the reasoning as a short analyst note.
// It only reformats the numbers the engine already computed. If the key is missing or the call fails, the
// dashboard shows the built-in rule-based reasoning instead.
const crypto = require('crypto');

let cache = { hash: null, text: null, at: 0, error: null };

async function writeNote(env, facts) {
  const key = env.GEMINI_API_KEY;
  if (!key) return { text: null, error: null, source: 'rules' };
  const hash = crypto.createHash('sha1').update(JSON.stringify(facts)).digest('hex');
  const minGap = (parseInt(env.LLM_MIN_MINUTES, 10) || 30) * 60000; // protects the free-tier quota
  if (cache.text && (cache.hash === hash || Date.now() - cache.at < minGap)) return { text: cache.text, error: null, source: 'gemini', at: cache.at };
  if (!cache.text && cache.error && Date.now() - cache.at < 5 * 60000) return { text: null, error: cache.error, source: 'rules' };

  const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const prompt =
    'You are a macro analyst writing for a student monetary policy committee in India. Using ONLY the JSON facts below, ' +
    'write a note of 4 short paragraphs (under 220 words total) in plain English: (1) recommendation, (2) why, (3) what could change it, (4) one thing to watch before the meeting. ' +
    'Do not change any number, do not add facts that are not in the JSON, no bullet points, no markdown.\n\nFACTS:\n' + JSON.stringify(facts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 600 } }),
    });
    if (!r.ok) throw new Error('Gemini HTTP ' + r.status);
    const j = await r.json();
    const text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map((p) => p.text).join('').trim();
    if (!text) throw new Error('empty Gemini reply');
    cache = { hash, text, at: Date.now(), error: null };
    return { text, error: null, source: 'gemini', at: cache.at };
  } catch (e) {
    cache.error = String(e.message || e); cache.at = Date.now();
    return { text: cache.hash === hash ? cache.text : null, error: cache.error, source: 'rules' };
  } finally { clearTimeout(timeout); }
}

module.exports = { writeNote };

/* ==========================================================================
   Luvli ♡ — api/luvli-coach.js  (Vercel edition)
   --------------------------------------------------------------------------
   The same real-AI coach endpoint as netlify/functions/luvli-coach.js, written
   for Vercel's serverless functions so you can deploy Luvli on either host.

   Use this one *or* the Netlify one — never both. Whichever host you pick,
   point js/coach-config.js at its URL:

     Vercel:   endpoint: '/api/luvli-coach'   (this file's own path)
     Netlify:  endpoint: '/api/luvli-coach'   (via the redirect in netlify.toml)

   Environment variables (Vercel → Project → Settings → Environment Variables)
   ---------------------------------------------------------------------------
     COACH_API_KEY          required  your model provider key
     COACH_PROVIDER         optional  'openai' (default) | 'anthropic'
     COACH_MODEL            optional  e.g. gpt-4o-mini, claude-3-5-haiku-latest
     LUVLI_ALLOWED_ORIGIN   optional  lock CORS to your site

   With no COACH_API_KEY set, this returns { degraded: true } and the browser
   quietly falls back to the on-device coach — Luvli never breaks.
   ========================================================================== */
'use strict';

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    build: (key, model, system, messages) => ({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: {
        model,
        messages: [{ role: 'system', content: system }].concat(messages),
        temperature: 0.7,
        max_tokens: 400
      }
    }),
    pick: (data) => data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-haiku-latest',
    build: (key, model, system, messages) => ({
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: { model, system, messages, max_tokens: 400, temperature: 0.7 }
    }),
    pick: (data) => data && data.content && data.content[0] && data.content[0].text
  }
};

const SYSTEM_PROMPT = [
  'You are Luvli, a gentle, warm coach inside a day-planning app called Luvli.',
  'You speak kindly and plainly, never preachy or clinical. You are never a therapist',
  'and never give medical advice; if someone describes a crisis, you gently point them',
  'to real human help.',
  '',
  'Rules:',
  '- Keep replies to 2-5 short sentences unless asked for more.',
  '- Use the person\'s real day (given as context) when it helps, and be specific.',
  '- Offer one clear next step, never a lecture.',
  '- Never invent activities or times that are not in the context.',
  '- If they mention a feeling, name it kindly before offering a step.'
].join('\n');

function corsHeaders() {
  const allowed = process.env.LUVLI_ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function contextBlock(context) {
  const lines = [];
  if (context.name) lines.push('Name: ' + String(context.name).slice(0, 60));
  if (context.current) lines.push('Happening now: ' + String(context.current).slice(0, 120));
  if (context.next) lines.push('Next up: ' + String(context.next).slice(0, 120));
  const planned = Array.isArray(context.planned) ? context.planned.slice(0, 12) : [];
  if (planned.length) {
    lines.push('Their plan today:');
    planned.forEach((a) => {
      const when = a && a.start ? ' at ' + String(a.start).slice(0, 10) : '';
      const how = a && a.minutes ? ' (' + Number(a.minutes) + ' min)' : '';
      lines.push('  - ' + String((a && a.name) || 'something').slice(0, 120) + when + how);
    });
  }
  return lines.length ? lines.join('\n') : 'No plan for today yet.';
}

module.exports = async (req, res) => {
  const cors = corsHeaders();
  Object.keys(cors).forEach((name) => res.setHeader(name, cors[name]));

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  const key = process.env.COACH_API_KEY;
  if (!key) { res.status(200).json({ reply: '', degraded: true, reason: 'no-key' }); return; }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const message = String(payload.message || '').slice(0, 2000).trim();
  if (!message) { res.status(400).json({ error: 'A message is required.' }); return; }

  const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
  const turns = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  const providerName = (process.env.COACH_PROVIDER || 'openai').toLowerCase();
  const provider = PROVIDERS[providerName] || PROVIDERS.openai;
  const model = process.env.COACH_MODEL || provider.defaultModel;
  const messages = turns.concat([{ role: 'user', content: message }]);
  const system = SYSTEM_PROMPT + '\n\nTheir day right now:\n' + contextBlock(payload.context || {});
  const built = provider.build(key, model, system, messages);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) {
      console.error('[luvli-coach] provider error', response.status);
      res.status(200).json({ reply: '', degraded: true, reason: 'provider-' + response.status });
      return;
    }
    const data = await response.json();
    const text = provider.pick(data);
    if (!text) { res.status(200).json({ reply: '', degraded: true, reason: 'empty' }); return; }
    res.status(200).json({ reply: String(text).trim(), tools: [] });
  } catch (err) {
    clearTimeout(timer);
    console.error('[luvli-coach] request failed', err && err.message);
    res.status(200).json({ reply: '', degraded: true, reason: 'network' });
  }
};

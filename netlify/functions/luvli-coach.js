/* ==========================================================================
   Luvli ♡ — netlify/functions/luvli-coach.js
   --------------------------------------------------------------------------
   The real AI behind the Luvli life coach.

   This is the server half of js/coach-config.js: the browser posts a message
   here, this function talks to a real language model and returns Luvli's reply.
   It exists so your model API key can stay secret — it lives in an environment
   variable, never in the page.

   Deploy
   ------
   Netlify: drop this file in netlify/functions/ and Netlify serves it at
            /.netlify/functions/luvli-coach  (or /api/luvli-coach with a
            redirect — see netlify.toml).
   Then set js/coach-config.js:
            mode: 'model',
            endpoint: '/api/luvli-coach'

   Environment variables (Netlify → Site settings → Environment)
   -------------------------------------------------------------
     COACH_API_KEY     required  your model provider key
     COACH_PROVIDER    optional  'openai' (default) | 'anthropic'
     COACH_MODEL       optional  e.g. gpt-4o-mini, claude-3-5-haiku-latest
     LUVLI_ALLOWED_ORIGIN optional  lock CORS to your site, e.g. https://luvli.app

   Nothing here is required for Luvli to work: with no key set, the coach simply
   uses its on-device brain and this function is never called.
   ========================================================================== */
'use strict';

/* ------------------------------- configuration ---------------------------- */

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    build: (key, model, system, messages) => ({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
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

/* The voice. Kept short and steady so replies stay Luvli: warm, brief, useful. */
const SYSTEM_PROMPT = [
  'You are Luvli, a gentle, warm life coach inside a day-planning app called Luvli.',
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

/* --------------------------------- helpers -------------------------------- */

const json = (status, body, headers) => ({
  statusCode: status,
  headers: Object.assign({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }, headers || {}),
  body: JSON.stringify(body)
});

/** CORS headers, locked to your site when LUVLI_ALLOWED_ORIGIN is set. */
function corsHeaders(event) {
  const allowed = process.env.LUVLI_ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

/** Trim and shape everything the browser sent into safe, bounded input. */
function readRequest(event) {
  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (err) { payload = {}; }

  const message = String(payload.message || '').slice(0, 2000).trim();
  const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};

  const turns = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  return { message, turns, context };
}

/** A short, factual description of their day, so the model has real ground. */
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

/* ------------------------------- the handler ------------------------------ */

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' }, cors);

  const key = process.env.COACH_API_KEY;
  if (!key) {
    // No key configured: tell the page honestly so it can use its own brain.
    return json(200, { reply: '', degraded: true, reason: 'no-key' }, cors);
  }

  const { message, turns, context } = readRequest(event);
  if (!message) return json(400, { error: 'A message is required.' }, cors);

  const providerName = (process.env.COACH_PROVIDER || 'openai').toLowerCase();
  const provider = PROVIDERS[providerName] || PROVIDERS.openai;
  const model = process.env.COACH_MODEL || provider.defaultModel;

  const messages = turns.concat([{ role: 'user', content: message }]);
  const system = SYSTEM_PROMPT + '\n\nTheir day right now:\n' + contextBlock(context);
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
      const detail = await response.text().catch(() => '');
      console.error('[luvli-coach] provider error', response.status, detail.slice(0, 500));
      // Degrade gracefully: the page will fall back to the on-device brain.
      return json(200, { reply: '', degraded: true, reason: 'provider-' + response.status }, cors);
    }

    const data = await response.json();
    const text = provider.pick(data);
    if (!text) return json(200, { reply: '', degraded: true, reason: 'empty' }, cors);

    // tools are left empty here: the on-device brain owns action buttons, so a
    // model reply is always plain, safe text.
    return json(200, { reply: String(text).trim(), tools: [] }, cors);
  } catch (err) {
    clearTimeout(timer);
    console.error('[luvli-coach] request failed', err && err.message);
    return json(200, { reply: '', degraded: true, reason: 'network' }, cors);
  }
};

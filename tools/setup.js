#!/usr/bin/env node
/* ==========================================================================
   Luvli ♡ — tools/setup.js
   --------------------------------------------------------------------------
   An interactive setup that writes your two real-integration values into the
   config files for you, so you never have to edit them by hand.

     npm run setup

   It asks for:
     1. your Google OAuth client ID   → js/auth-config.js
     2. your coach endpoint + key     → js/coach-config.js  and  .env

   It is careful: it reads each file, replaces only the one quoted value, and
   writes it back unchanged otherwise. Nothing is sent anywhere — this script
   only touches files on your machine.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = path.join(__dirname, '..');
const AUTH_CONFIG = path.join(root, 'js', 'auth-config.js');
const COACH_CONFIG = path.join(root, 'js', 'coach-config.js');
const ENV_FILE = path.join(root, '.env');

/*
 * Asking for input, two ways.
 *
 * In a real terminal (a TTY) we use readline's question(), which is the normal
 * interactive experience.
 *
 * When stdin is NOT a terminal — piped input, a file, CI — readline's question()
 * only ever resolves the first call and then stalls, so the script would hang on
 * question two. In that case we read every line up front and answer from a queue
 * instead. This keeps `npm run setup` scriptable without breaking the interactive
 * flow.
 */
const isInteractive = Boolean(process.stdin.isTTY);
const rl = isInteractive
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

let queued = null;

function readQueuedLines() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.split(/\r?\n/)));
  });
}

let queueIndex = 0;
const ask = async (question) => {
  if (isInteractive) {
    return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
  }
  if (!queued) queued = await readQueuedLines();
  process.stdout.write(question);
  const line = queued[queueIndex] !== undefined ? queued[queueIndex] : '';
  queueIndex++;
  process.stdout.write(line + '\n');
  return String(line).trim();
};

/* A value we can safely drop into a single-quoted JS string. */
function jsString(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function readFileOr(file, fallback) {
  try { return fs.readFileSync(file, 'utf8'); } catch (err) { return fallback; }
}

/*
 * Replace the first REAL  name: '<anything>'  with  name: '<value>'.
 * Commented-out examples (lines whose first non-space char is //) are ignored,
 * so we never rewrite documentation instead of configuration.
 */
function setProperty(text, name, value) {
  const re = new RegExp('^(\\s*)' + name + '\\s*:\\s*(\'[^\']*\'|"[^"]*")');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\//.test(lines[i])) continue;   // a comment, not config
    if (re.test(lines[i])) {
      lines[i] = lines[i].replace(re, (_m, indent) => indent + name + ': ' + jsString(value));
      return lines.join('\n');
    }
  }
  return null;
}

/** Read the current, uncommented value of a property. */
function getProperty(text, name) {
  const re = new RegExp('^\\s*' + name + '\\s*:\\s*(\'([^\']*)\'|"([^"]*)")');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\//.test(lines[i])) continue;
    const m = re.exec(lines[i]);
    if (m) return m[2] !== undefined ? m[2] : m[3];
  }
  return '';
}

async function main() {
  console.log('');
  console.log('  Luvli ♡  setup');
  console.log('  -------------');
  console.log('  Press Enter to skip any question and keep the current value.');
  console.log('');

  /* ------------------------- 1. Google client ID ------------------------- */
  const currentAuth = readFileOr(AUTH_CONFIG, '');
  const currentClientId = getProperty(currentAuth, 'clientId');

  console.log('  1) Real Google sign-in');
  console.log('     Google Cloud Console -> APIs & Services -> Credentials');
  console.log('     -> Create credentials -> OAuth client ID -> Web application.');
  console.log('     Add http://localhost:8080 under "Authorised JavaScript origins".');
  console.log('     Current value: ' + (currentClientId || '(none)'));
  const clientId = await ask('     Client ID (…apps.googleusercontent.com): ');

  if (clientId) {
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) {
      console.log('     ! That does not look like a client ID. Expected it to end');
      console.log('       in ".apps.googleusercontent.com". Skipping to be safe.');
    } else if (!currentAuth) {
      console.log('     ! js/auth-config.js was not found. Skipping.');
    } else {
      const updated = setProperty(currentAuth, 'clientId', clientId);
      if (!updated) {
        console.log('     ! Could not find a clientId line to replace. Skipping.');
      } else {
        fs.writeFileSync(AUTH_CONFIG, updated, 'utf8');
        console.log('     ✓ wrote your client ID into js/auth-config.js');
      }
    }
  } else {
    console.log('     – skipped (Google sign-in stays local)');
  }

  /* --------------------------- 2. Coach model ---------------------------- */
  console.log('');
  console.log('  2) Real AI coach');
  console.log('     Deploy netlify/functions/luvli-coach.js (or api/luvli-coach.js),');
  console.log('     then enter the URL the page should call.');
  console.log('     For local development use:  /api/luvli-coach');
  const endpoint = await ask('     Coach endpoint [/api/luvli-coach]: ');

  if (endpoint) {
    const currentCoach = readFileOr(COACH_CONFIG, '');
    if (!currentCoach) {
      console.log('     ! js/coach-config.js was not found. Skipping.');
    } else {
      let updated = setProperty(currentCoach, 'mode', 'model');
      updated = updated && setProperty(updated, 'endpoint', endpoint);
      if (!updated) {
        console.log('     ! Could not find the mode/endpoint lines. Skipping.');
      } else {
        fs.writeFileSync(COACH_CONFIG, updated, 'utf8');
        console.log('     ✓ switched the coach to model mode in js/coach-config.js');
      }
    }
  } else {
    console.log('     – skipped (the coach stays fully on-device)');
  }

  /* ------------------------------ 3. The key ----------------------------- */
  console.log('');
  console.log('  3) Your model API key (the ONE secret).');
  console.log('     Get one:  https://platform.openai.com/api-keys');
  console.log('         or:   https://console.anthropic.com/settings/keys');
  const apiKey = await ask('     API key (written to .env, never committed): ');

  if (apiKey) {
    const currentEnv = readFileOr(ENV_FILE, readFileOr(path.join(root, '.env.example'), 'COACH_API_KEY=\nCOACH_PROVIDER=openai\nCOACH_MODEL=\nLUVLI_ALLOWED_ORIGIN=\n'));
    const updated = currentEnv.replace(/COACH_API_KEY=.*/g, 'COACH_API_KEY=' + apiKey);
    fs.writeFileSync(ENV_FILE, updated, 'utf8');
    console.log('     ✓ wrote your key into .env (which .gitignore already protects)');
  } else {
    console.log('     – skipped. Without a key the coach just uses its on-device brain.');
  }

  /* -------------------------------- done -------------------------------- */
  console.log('');
  console.log('  Done ♡');
  console.log('');
  console.log('  Next:  npm run dev     starts Luvli + the coach function locally');
  console.log('         npm run verify  checks everything still passes');
  console.log('');
  if (rl) rl.close();
}

main().catch((err) => {
  console.error('Setup stopped: ' + (err && err.message));
  if (rl) rl.close();
  process.exit(1);
});

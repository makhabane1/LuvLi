/* tools/check-css.js — quick sanity checks on the stylesheet:
     1. braces and parentheses are balanced
     2. every class used in markup (HTML or JS templates) has a rule,
        apart from a short list of intentional semantic-only hooks       */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const css = read('css/style.css');
const html = read('index.html');
// auth-ui.js is audited with the account pages below, not here.
const jsFiles = ['js/storage.js', 'js/auth.js', 'js/scheduler.js', 'js/affirmations.js', 'js/progress.js',
  'js/pomodoro.js', 'js/notifications.js', 'js/sync.js', 'js/app.js'].filter((file) => {
  try { fs.accessSync(path.join(root, file)); return true; } catch (err) { return false; }
});
const js = jsFiles.map(read).join('\n');

const count = (text, character) => (text.split(character).length - 1);
const braces = count(css, '{') === count(css, '}');
const parens = count(css, '(') === count(css, ')');

const collect = (text) => {
  const out = [];
  const regex = /class="([^"']+)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    match[1].split(/\s+/).forEach((name) => {
      if (name && name.indexOf('{') === -1 && name.indexOf("'") === -1 &&
          name.indexOf('+') === -1 && name.indexOf(':') === -1) out.push(name);
    });
  }
  return out;
};

const used = Array.from(new Set(collect(html).concat(collect(js))));
const defined = new Set((css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).map((name) => name.slice(1)));

// Purely semantic hooks: they sit next to .card for readability and carry no
// rules of their own on purpose.
const semanticOnly = ['hero', 'card-progress', 'card-checkin', 'card-live', 'card-actions', 'card-activity'];
const missing = used.filter((name) => !defined.has(name) && semanticOnly.indexOf(name) === -1);

// Every activity category needs a hue and a hook, so the timeline, the day grid
// and the live list can all colour-code themselves from the same place.
const categoryBlock = (read('js/scheduler.js').match(/const CATEGORIES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const categoryKeys = Array.from(categoryBlock.matchAll(/^\s{4}([a-z][a-z-]*):/gm)).map((match) => match[1]);
const unhued = categoryKeys.filter((key) =>
  css.indexOf('--cat-' + key + ':') === -1 || css.indexOf('[data-cat="' + key + '"]') === -1);

console.log('CSS braces:', count(css, '{') + '/' + count(css, '}'), braces ? 'balanced ✓' : 'MISMATCH ✗');
console.log('CSS parens:', count(css, '(') + '/' + count(css, ')'), parens ? 'balanced ✓' : 'MISMATCH ✗');
console.log('classes used in markup:', used.length);
console.log('classes with rules   :', defined.size);
console.log('category hues        :', categoryKeys.length);

// Every var(--x) should be defined somewhere, otherwise that rule silently
// falls back to nothing. --fx-x/--fx-y are set inline by the hearts animation.
const usedVars = Array.from(new Set((css.match(/var\((--[a-z0-9-]+)/g) || []).map((m) => m.slice(4))));
const definedVars = new Set((css.match(/(--[a-z0-9-]+)\s*:/g) || []).map((m) => m.replace(/\s*:$/, '')));
const undefVars = usedVars.filter((name) => !definedVars.has(name) && name.indexOf('--fx-') !== 0);

/* ------------- 💗 My Luvli Style ♡ (css/personality.css) -------------
   The onboarding page has its own stylesheet (sharing the tokens from
   style.css), so check it stands on its own: balanced, every class it uses has
   a rule, and every var() it references is defined by *either* stylesheet. */
let ls = { braces: true, parens: true, missing: [], undefVars: [], classes: 0 };
try {
  const lsCss = read('css/personality.css');
  const lsHtml = read('personality.html');
  const lsJs = ['js/personality.js', 'js/personality-page.js'].filter((file) => {
    try { fs.accessSync(path.join(root, file)); return true; } catch (err) { return false; }
  }).map(read).join('\n');

  ls.braces = count(lsCss, '{') === count(lsCss, '}');
  ls.parens = count(lsCss, '(') === count(lsCss, ')');

  const lsUsed = Array.from(new Set(collect(lsHtml).concat(collect(lsJs))));
  const lsDefined = new Set((lsCss.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).map((n) => n.slice(1)));
  // Classes the page borrows from the shared design system (style.css) are fine.
  const sharedDefined = new Set((css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).map((n) => n.slice(1)));
  ls.classes = lsUsed.length;
  ls.missing = lsUsed.filter((n) => !lsDefined.has(n) && !sharedDefined.has(n) &&
    semanticOnly.indexOf(n) === -1);

  const lsUsedVars = Array.from(new Set((lsCss.match(/var\((--[a-z0-9-]+)/g) || []).map((m) => m.slice(4))));
  const sharedVars = new Set([
    ...(css.match(/(--[a-z0-9-]+)\s*:/g) || []),
    ...(lsCss.match(/(--[a-z0-9-]+)\s*:/g) || [])
  ].map((m) => m.replace(/\s*:$/, '')));
  // --swatch is set inline per avatar colour button (see renderCustom), and
  // --fx-* is set inline by the hearts animation.
  ls.undefVars = lsUsedVars.filter((n) => !sharedVars.has(n) &&
    n.indexOf('--fx-') !== 0 && n !== '--swatch');
} catch (err) { /* the page may not exist in a trimmed checkout */ }

console.log('');
console.log('UNSTYLED CLASSES:', missing.length ? missing : 'none ✓');
console.log('UNCOLOURED CATEGORIES:', unhued.length ? unhued : 'none ✓');
console.log('UNDEFINED CSS VARS:', undefVars.length ? undefVars : 'none ✓');
console.log('');
console.log('— 💗 My Luvli Style ♡ —');
console.log('CSS braces:', ls.braces ? 'balanced ✓' : 'MISMATCH ✗');
console.log('classes used in markup:', ls.classes);
console.log('STYLE UNSTYLED CLASSES:', ls.missing.length ? ls.missing : 'none ✓');
console.log('STYLE UNDEFINED CSS VARS:', ls.undefVars.length ? ls.undefVars : 'none ✓');

const lsBad = !ls.braces || !ls.parens || ls.missing.length || ls.undefVars.length;

/* ------------- ♡ Accounts (login.html / signup.html) ------------------
   The account screens share css/auth.css and add one small sheet each. Audit
   them the same way as My Luvli Style: every class in their markup or scripts
   must have a rule somewhere in {style, auth, login, signup}.css, and every
   var() must be defined by one of them. */
let acct = { braces: true, parens: true, missing: [], undefVars: [], classes: 0 };
try {
  const exists = (file) => {
    try { fs.accessSync(path.join(root, file)); return true; }
    catch (err) { return false; }
  };
  const acctCss = ['css/auth.css', 'css/login.css', 'css/signup.css'].filter(exists).map(read).join('\n');
  const acctHtml = ['login.html', 'signup.html'].filter(exists).map(read).join('\n');
  const acctJs = ['js/auth-ui.js', 'js/login.js', 'js/signup.js', 'js/auth-guard.js'].filter(exists).map(read).join('\n');

  acct.braces = count(acctCss, '{') === count(acctCss, '}');
  acct.parens = count(acctCss, '(') === count(acctCss, ')');

  const acctUsed = Array.from(new Set(collect(acctHtml).concat(collect(acctJs))));
  const acctDefined = new Set((acctCss.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).map((n) => n.slice(1)));
  // Classes borrowed from the shared design system (style.css) are fine too.
  const sharedDefined = new Set((css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) || []).map((n) => n.slice(1)));
  acct.classes = acctUsed.length;
  acct.missing = acctUsed.filter((n) => !acctDefined.has(n) && !sharedDefined.has(n) &&
    semanticOnly.indexOf(n) === -1);

  const acctVars = Array.from(new Set((acctCss.match(/var\((--[a-z0-9-]+)/g) || []).map((m) => m.slice(4))));
  const acctVarDefs = new Set([
    ...(css.match(/(--[a-z0-9-]+)\s*:/g) || []),
    ...(acctCss.match(/(--[a-z0-9-]+)\s*:/g) || [])
  ].map((m) => m.replace(/\s*:$/, '')));
  // --dur / --delay / --mx / --sheen-delay are set inline by JS or markup.
  const inlineVars = ['--mx', '--dur', '--delay', '--sheen-delay'];
  acct.undefVars = acctVars.filter((n) => !acctVarDefs.has(n) && inlineVars.indexOf(n) === -1);
} catch (err) { /* the pages may not exist in a trimmed checkout */ }

console.log('');
console.log('— ♡ Accounts (login / signup) —');
console.log('CSS braces:', acct.braces ? 'balanced ✓' : 'MISMATCH ✗');
console.log('classes used in markup:', acct.classes);
console.log('ACCOUNT UNSTYLED CLASSES:', acct.missing.length ? acct.missing : 'none ✓');
console.log('ACCOUNT UNDEFINED CSS VARS:', acct.undefVars.length ? acct.undefVars : 'none ✓');

const acctBad = !acct.braces || !acct.parens || acct.missing.length || acct.undefVars.length;
process.exitCode = (braces && parens && !missing.length && !unhued.length && !undefVars.length && !lsBad && !acctBad) ? 0 : 1;

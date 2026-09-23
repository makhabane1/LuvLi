/* tools/check-static.js — catches the usual plain-HTML/JS wiring mistakes:
   1. ids used from JavaScript that exist nowhere
   2. CSS selectors used from JavaScript that match nothing
   3. data-action buttons with no handler (dead buttons)
   4. handler cases for buttons that no longer exist                    */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('css/style.css');
// auth-ui.js / login.js / signup.js drive the account pages, not index.html,
// so they are audited against login.html + signup.html further down.
const jsFiles = ['js/storage.js', 'js/auth.js', 'js/scheduler.js', 'js/affirmations.js', 'js/progress.js',
  'js/pomodoro.js', 'js/notifications.js', 'js/sync.js', 'js/app.js'].filter((file) => {
  try { fs.accessSync(path.join(root, file)); return true; } catch (err) { return false; }
});
const js = jsFiles.map((file) => ({ file, text: read(file) }));

const unique = (list) => Array.from(new Set(list));
const matches = (text, regex) => {
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) out.push(match[1]);
  return out;
};

/* ---------------------------------- ids ---------------------------------- */
const htmlIds = unique(matches(html, /\sid="([^"]+)"/g));
const queried = [];
js.forEach(({ file, text }) => {
  [
    ...matches(text, /getElementById\(\s*'([^']+)'/g),
    ...matches(text, /(?:\$|setHtml|setText|onEnter|click)\(\s*'([^']+)'/g),
    ...matches(text, /(?<![A-Za-z])on\(\s*'([^']+)'/g),
    ...matches(text, /wireAppInput\(\s*'([^']+)'\s*,\s*'([^']+)'/g),
    ...matches(text, /wireSettingsApps\(\s*'([^']+)'\s*,\s*'([^']+)'/g)
  ].forEach((id) => { if (/^[A-Za-z][\w-]*$/.test(id)) queried.push({ file, id }); });
});
const createdInJs = unique(js.flatMap(({ text }) => matches(text, /\sid="([^"]+)"/g)));
const missingIds = queried.filter((entry) =>
  htmlIds.indexOf(entry.id) === -1 && createdInJs.indexOf(entry.id) === -1);

/* ------------------------------- selectors ------------------------------- */
const selectorQueries = js.flatMap(({ file, text }) => [
  ...matches(text, /\$\$\(\s*'([^']+)'/g),
  ...matches(text, /querySelector(?:All)?\(\s*'([^']+)'/g)
].map((selector) => ({ file, selector })));

const badSelectors = selectorQueries.filter(({ selector }) => selector.split(/\s+/).some((part) => {
  if (part.indexOf('#') === 0) return htmlIds.indexOf(part.slice(1)) === -1;
  if (part.indexOf('.') === 0) {
    const name = part.slice(1).replace(/[^A-Za-z0-9_-].*$/, '');
    if (name.indexOf('[') > -1) return false;
    return !html.includes('"' + name) && !html.includes(' ' + name) && !css.includes('.' + name);
  }
  return false;
}));

/* ------------------------------ data-actions ----------------------------- */
const actionsInHtml = matches(html, /data-action="([^"]+)"/g);
const actionsInJs = js.flatMap(({ text }) => [
  ...matches(text, /data-action="([a-z0-9-]+)"/g),
  ...matches(text, /action:\s*'([a-z0-9-]+)'/g),
  ...matches(text, /confirmAction:\s*'([a-z0-9-]+)'/g)
]);

const appText = read('js/app.js');
// Just the onAction switch itself — it ends at the accessibility section that
// follows it (which contains its own, unrelated, keyboard switch).
const appRegion = appText.slice(appText.indexOf('function onAction(event)'),
  appText.indexOf('accessibility', appText.indexOf('function onAction(event)')));
const pomodoroText = read('js/pomodoro.js');
const pomodoroRegion = pomodoroText.slice(pomodoroText.indexOf('function onActionClick(event)'),
  pomodoroText.indexOf('function mount()', pomodoroText.indexOf('function onActionClick(event)')));

const handled = [
  ...matches(appRegion, /case\s+'([a-z0-9-]+)':/g),
  ...matches(pomodoroRegion, /case\s+'([a-z0-9-]+)':/g)
];
const usedActions = unique(actionsInHtml.concat(actionsInJs));
const handledActions = unique(handled);
// Emitted with string concatenation (invisible to the scan), handled by the
// service worker rather than the page, or used from one of the companion pages
// (personality.html, ai-coach.html, vision-board.html) instead of index.html —
// so they only *look* unhandled from here.
const dynamicActions = [
  'toggle-aff-category', 'remove-app', 'snooze', 'start',
  'style-today', 'style-today-set', 'style-switch', 'style-switch-set',
  'style-pick', 'toggle-affirmation-style'
];
const unhandled = usedActions.filter((action) =>
  handledActions.indexOf(action) === -1 && dynamicActions.indexOf(action) === -1);
const unreachable = handledActions.filter((action) =>
  usedActions.indexOf(action) === -1 && dynamicActions.indexOf(action) === -1);

/* ------------- 💗 My Luvli Style ♡ (personality.html) wiring -------------
   The onboarding page is built from its own HTML + scripts, so it needs the
   same two audits: every id it reads must exist, and every data-action button
   it renders must have a handler in its action switch. */
const personality = { html: '', css: '', js: [] };
try {
  personality.html = read('personality.html');
  personality.css = read('css/personality.css');
} catch (err) { /* the page may not exist in a trimmed checkout */ }
if (personality.html) {
  personality.js = ['js/personality.js', 'js/personality-page.js'].filter((file) => {
    try { fs.accessSync(path.join(root, file)); return true; } catch (err) { return false; }
  }).map((file) => ({ file, text: read(file) }));
}

const lsHtmlIds = unique(matches(personality.html, /\sid="([^"]+)"/g));
const lsQueried = [];
personality.js.forEach(({ file, text }) => {
  [
    ...matches(text, /lsId\(\s*'([^']+)'/g),
    ...matches(text, /(?:getElementById|setText|setHtml|lsGet)\(\s*'([^']+)'/g),
    ...matches(text, /(?<![\.\w])on\(\s*'([^']+)'/g)
  ].forEach((id) => { if (/^[A-Za-z][\w-]*$/.test(id)) lsQueried.push({ file, id }); });
});
// ids the page script reads that the HTML must provide (the run-time stage)
const lsStageIds = unique(lsQueried.map((q) => q.id)).filter((id) => id.indexOf('ls') === 0 && id !== 'lsAnnouncer');
const lsStageMissing = lsStageIds.filter((id) => lsHtmlIds.indexOf(id) === -1);

const lsActionsInHtml = unique([
  ...matches(personality.html, /data-action="([^"]+)"/g),
  ...personality.js.flatMap(({ text }) => matches(text, /data-action="([a-z0-9-]+)"/g))
]);
const lsActionRegion = (personality.js.find((f) => /personality-page\.js/.test(f.file)) || {}).text || '';
const lsHandled = matches(lsActionRegion.slice(lsActionRegion.indexOf('function onAction(event)')),
  /case\s+'([a-z0-9-]+)':/g);
const lsUnhandled = lsActionsInHtml.filter((action) => lsHandled.indexOf(action) === -1);

/* --------------------------------- report -------------------------------- */
console.log('ids in index.html      :', htmlIds.length);
console.log('ids queried from JS    :', unique(queried.map((q) => q.id)).length);
console.log('selectors used from JS :', selectorQueries.length);
console.log('data-action values     :', usedActions.length);
console.log('handler cases          :', handledActions.length);
console.log('');
console.log('MISSING IDS:', missingIds.length ? missingIds : 'none ✓');
console.log('BAD SELECTORS:', badSelectors.length ? badSelectors : 'none ✓');
console.log('UNHANDLED ACTIONS:', unhandled.length ? unhandled : 'none ✓');
console.log('UNREACHABLE HANDLERS:', unreachable.length ? unreachable : 'none ✓');

if (personality.html) {
  console.log('');
  console.log('— 💗 My Luvli Style ♡ —');
  console.log('ids in personality.html :', lsHtmlIds.length);
  console.log('ids read by the page    :', unique(lsQueried.map((q) => q.id)).length);
  console.log('data-action values      :', lsActionsInHtml.length);
  console.log('MISSING STYLE IDS:', lsStageMissing.length ? lsStageMissing : 'none ✓');
  console.log('UNHANDLED STYLE ACTIONS:', lsUnhandled.length ? lsUnhandled : 'none ✓');
}

/* ---------------- ♡ Accounts (login.html / signup.html) ---------------
   Every id the account pages read must exist in one of those two files. */
const account = { html: '', missing: [], ids: 0, queried: 0 };
const accountExists = (file) => {
  try { fs.accessSync(path.join(root, file)); return true; } catch (err) { return false; }
};
const accountFiles = ['login.html', 'signup.html'];
const accountHtml = accountFiles.filter(accountExists).map(read).join('\n');
if (accountHtml) {
  account.html = accountHtml;
  const accountIds = unique(matches(accountHtml, /\sid="([^"]+)"/g));
  const accountJs = ['js/auth-ui.js', 'js/login.js', 'js/signup.js', 'js/auth-guard.js']
    .filter(accountExists).map((file) => ({ file, text: read(file) }));
  const accountQueried = [];
  accountJs.forEach(({ file, text }) => {
    [
      ...matches(text, /getElementById\(\s*'([^']+)'/g),
      ...matches(text, /(?<![\w.])\$\(\s*'([^']+)'/g)
    ].forEach((id) => { if (/^[A-Za-z][\w-]*$/.test(id)) accountQueried.push({ file, id }); });
  });
  account.ids = accountIds.length;
  account.queried = unique(accountQueried.map((q) => q.id)).length;
  // 'onbStep' is built dynamically as 'onbStep' + i, so ignore the prefix.
  const dynamicIds = ['onbStep'];
  account.missing = accountQueried.filter((entry) =>
    accountIds.indexOf(entry.id) === -1 && dynamicIds.indexOf(entry.id) === -1);
}

if (account.html) {
  console.log('');
  console.log('— ♡ Accounts (login / signup) —');
  console.log('ids in login + signup  :', account.ids);
  console.log('ids read by their JS   :', account.queried);
  console.log('MISSING ACCOUNT IDS:', account.missing.length ? account.missing : 'none ✓');
}

const accountBad = account.missing.length;
const lsBad = lsStageMissing.length || lsUnhandled.length;
process.exitCode = (missingIds.length || unhandled.length || unreachable.length || badSelectors.length || lsBad || accountBad) ? 1 : 0;

/* tools/parse-check.js — node --check for every app module. */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const files = ['js/icons.js', 'js/storage.js', 'js/scheduler.js', 'js/affirmations.js', 'js/progress.js',
  'js/pomodoro.js', 'js/notifications.js', 'js/sync.js', 'js/app.js', 'js/ai-coach.js'];
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(__dirname, '..', f)], { stdio: 'pipe' });
    console.log('OK   ' + f);
  } catch (e) {
    bad++;
    console.log('FAIL ' + f + '\n' + String(e.stderr || e.message).split('\n').slice(0, 5).join('\n'));
  }
}
process.exit(bad ? 1 : 0);

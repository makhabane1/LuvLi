/* tools/run-with-timeout.js — runs a script and kills it if it hangs. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const script = process.argv[2];
const seconds = Number(process.argv[3] || 30);
const child = spawn(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });

const killer = setTimeout(() => {
  console.log('\n*** TIMED OUT after ' + seconds + 's — killing ' + script + ' ***');
  child.kill();
  process.exitCode = 1;
}, seconds * 1000);

child.on('exit', (code) => {
  clearTimeout(killer);
  console.log('[exited with code ' + code + ']');
  process.exitCode = code === null ? 1 : code;
});

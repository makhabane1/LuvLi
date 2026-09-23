'use strict';
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const memory = {};
const sb = {
  console, JSON, Math, Date, String, Number, Object, Array, Boolean, isNaN, parseInt, parseFloat,
  Error, RegExp, Promise, Set, Map,
  localStorage: {
    getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; },
    document: {
      addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => true,
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => []
    },
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
    setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 1, clearInterval: () => { }
  };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  const src = ['js/icons.js', 'js/storage.js', 'js/scheduler.js', 'js/affirmations.js', 'js/progress.js', 'js/personality.js']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
  vm.runInContext(src, sb, { filename: 'probe.js' });
  const run = (c) => vm.runInContext(c, sb, { filename: 'probe-test.js' });

  const seedCode = [
    'Storage.seedSampleDay(true);',
    'Storage.update(function(d){ d.tasks = [{ id: "rec_1", date: Utils.todayKey(), name: "Morning walk",',
    '  category: "exercise", start: "07:00", end: "07:30", priority: "low", notes: "", repeat: "daily",',
    '  completed: false, seriesId: "rec_1" }]; }, "test");',
    'Scheduler.materialiseRecurring(Storage.get(), 7);'
  ].join('\n');
  run(seedCode);

const listingCode = [
    'JSON.stringify(Scheduler.tasksFor(Utils.todayKey(), Storage.get()).map(function(t){',
    '  return t.name + " + t.start + "-" + t.end + " done:" + t.completed; }))'
  ].join('\n');
  console.log('tasks today:', run(listingCode));
  console.log('is-now in grid:', run('Scheduler.renderDayGrid(Storage.get(), Utils.todayKey(), Scheduler.timeToMinutes("13:20")).indexOf("is-now")'));

'use strict';
/* Quick behavioural probe for js/personality.js (temporary helper). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const memory = {};

const sandbox = {
  console, JSON, Math, Date, String, Number, Object, Array, Boolean, isNaN, parseInt, parseFloat,
  Error, RegExp, Promise, Set, Map,
  localStorage: {
    getItem: (k) => (k in memory ? memory[k] : null),
    setItem: (k, v) => { memory[k] = String(v); },
    removeItem: (k) => { delete memory[k]; }
  },
  document: {
    addEventListener: () => { }, removeEventListener: () => { },
    dispatchEvent: () => true, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => []
  },
  CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options && options.detail; },
  setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 1, clearInterval: () => { }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['js/icons.js', 'js/storage.js', 'js/scheduler.js', 'js/affirmations.js',
  'js/progress.js', 'js/personality.js'];
vm.runInContext(files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n'), sandbox,
  { filename: 'luvli-style-probe.js' });

const run = (code) => vm.runInContext(code, sandbox);

console.log('styles            :', run('LuvliStyle.STYLES.map(s => s.name).join(", ")'));
console.log('default style     :', run('LuvliStyle.get().name'));
run('Storage.seedSampleDay(false)');
console.log('after seed        :', run('LuvliStyle.get().name'), '/ chosen:', run('LuvliStyle.get().chosen'));

run('LuvliStyle.set("coach")');
console.log('switch to coach   :', run('LuvliStyle.get().name'), '/ today-only:', run('LuvliStyle.get().overriddenToday'));
console.log('voice morning     :', run('LuvliStyle.voice().morning'));
console.log('voice nudge       :', run('LuvliStyle.voice().nudge'));
console.log('reminder (soft)   :', run('LuvliStyle.reminderLine(LuvliStyle.get(), "Study session", 10)'));

run('LuvliStyle.setReminderStyle("minimal")');
console.log('reminder (minimal):', run('LuvliStyle.reminderLine(LuvliStyle.get(), "Study session", 10)'));
run('LuvliStyle.setReminderStyle("motivational")');
console.log('reminder (motiv.) :', run('LuvliStyle.reminderLine(LuvliStyle.get(), "Study session", 10)'));

console.log('avatar html       :', run('LuvliStyle.avatarHtml().replace(/\\s+/g, ").slice(0, 90)'));
console.log('chip html         :', run('LuvliStyle.chipHtml()'));
console.log('affirmation       :', run('LuvliStyle.affirmation().text'));
console.log('affirmation tags  :', run('LuvliStyle.affirmationList().slice(0,4).map(a => a.tag).join(", ")'));
console.log('morning message   :', run('LuvliStyle.morningMessage({ profile: { name: "Nelisiwe" } })'));
console.log('same all day      :', run('LuvliStyle.morningMessage() === LuvliStyle.morningMessage()'));
console.log('hero tagline      :', run('LuvliStyle.heroTagline()'));
console.log('memory summary    :', run('LuvliStyle.memorySummary().summary'));
console.log('adapters          :', run('JSON.stringify(LuvliStyle.adapters())'));

run('LuvliStyle.set("calm", { remember: true })');
console.log('stay as calm      :', run('LuvliStyle.get().name'), '/ today-only:', run('LuvliStyle.get().overriddenToday'));
console.log('top styles        :', run('LuvliStyle.topStyles().join(", ")'));
console.log('saved to storage  :', run('JSON.parse(localStorage.getItem(Storage.KEY)).personality.key'));
console.log('icons rendered    :', run('LuvliStyle.avatarHtml().indexOf("<svg") > -1'));

/* tools/auth-test.js — checks the account system (js/auth.js) with a light
   Node shim. The password hashing is async by design, so the whole run is
   awaited before reporting. No dependencies. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const memory = {};
const docListeners = {};

const sandbox = {
  console, JSON, Math, Date, String, Number, Object, Array, Boolean, isNaN, parseInt, parseFloat,
  Error, RegExp, Promise, Set, Map, Uint8Array, TextEncoder,
  localStorage: {
    getItem: (key) => (key in memory ? memory[key] : null),
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: (key) => { delete memory[key]; }
  },
  // A real SubtleCrypto stand-in so the SHA-256 path is exercised, not just
  // the fallback. It only needs to be *stable*, not cryptographically real.
  crypto: {
    getRandomValues: (bytes) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) % 256;
      return bytes;
    },
    subtle: {
      digest: (algo, data) => {
        const text = Array.from(data).join(',');
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
          h = (h ^ text.charCodeAt(i)) >>> 0;
          h = Math.imul(h, 16777619) >>> 0;
        }
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i++) out[i] = (h >> (i % 4 * 8)) & 0xff;
        return Promise.resolve(out.buffer);
      }
    }
  },
  document: {
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener: () => {},
    dispatchEvent: (event) => { (docListeners[event.type] || []).forEach((fn) => fn(event)); return true; },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options && options.detail; },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const sources = ['js/icons.js', 'js/storage.js', 'js/auth.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n;\n');

const results = [];
function check(label, condition, extra) {
  const pass = Boolean(condition);
  results.push({ label, pass });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  (' + extra + ')'));
}

const script = `
  const results = [];
  function check(label, condition, extra) {
    const pass = Boolean(condition);
    results.push({ label, pass });
    console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  (' + extra + ')'));
  }
`;

vm.runInContext(sources + '\n' + script, sandbox, { filename: 'luvli-auth.js' });
const run = (code) => vm.runInContext(code, sandbox, { filename: 'luvli-auth-test.js' });

(async () => {
  try {
    check('Luvli starts with no accounts', run('Auth.hasAccounts()') === false);
    check('and nobody signed in', run('Auth.isSignedIn()') === false);
    check('the new save shape carries an auth slice',
      run('typeof Storage.get().auth === "object" && Array.isArray(Storage.get().auth.accounts)'));

    /* ---- validation ------------------------------------------------ */
    const bad = run('Auth.validate({ name:"", email:"nope", password:"123", confirm:"124" })');
    check('a bad form is rejected', bad.ok === false);
    check('the name is asked for', Boolean(bad.errors.name));
    check('an invalid email is caught', Boolean(bad.errors.email));
    check('a short password is caught', Boolean(bad.errors.password));
    check('mismatched passwords are caught', Boolean(bad.errors.confirm));

    /* ---- create an account ----------------------------------------- */
    const created = await run('Auth.signUp({ name:"Nelisiwe Makhabane", email:"Nelisiwe@Example.com", password:"luvli2026", confirm:"luvli2026" }, { remember:true, color:"lavender" })');
    check('signing up succeeds', created.ok === true);
    check('and signs you straight in', run('Auth.isSignedIn()') === true);
    check('the account is remembered', run('Auth.accounts().length') === 1);
    check('the email is stored lower-case', run('Auth.accounts()[0].email') === 'nelisiwe@example.com');
    check('the password is never stored in the clear',
      run('Storage.exportJSON().indexOf("luvli2026")') === -1);
    check('a salted hash is stored instead',
      run('Auth.accounts()[0].hash.length') === 64 && run('Auth.accounts()[0].salt.length') === 32);
    check('the avatar choice is kept', run('Auth.current().avatar.color') === 'lavender');
    check('Luvli adopts your name',
      run('Storage.get().profile.name') === 'Nelisiwe Makhabane');
    check('initials are drawn from the name', run('Auth.initialsFor("Nelisiwe Makhabane")') === 'NM');
    check('the avatar renders a little character',
      run('Auth.avatarHtml(Auth.current(), { size:"sm" }).indexOf("auth-avatar")') > -1);

    /* ---- a duplicate email is refused ------------------------------ */
    const dupe = await run('Auth.signUp({ name:"Someone Else", email:"nelisiwe@example.com", password:"another1", confirm:"another1" })');
    check('the same email cannot sign up twice', dupe.ok === false);
    check('and is told to sign in instead', String(dupe.errors.email).indexOf('signing in') > -1,
      dupe.errors.email);

    /* ---- sign out / sign in ---------------------------------------- */
    run('Auth.signOut()');
    check('signing out clears the session', run('Auth.isSignedIn()') === false);
    check('but the account stays on the device', run('Auth.accounts().length') === 1);

    const wrong = await run('Auth.signIn({ email:"nelisiwe@example.com", password:"wrongpass" })');
    check('a wrong password is refused', wrong.ok === false && wrong.reason === 'bad-password');

    const unknown = await run('Auth.signIn({ email:"nobody@example.com", password:"whatever1" })');
    check('an unknown email is refused', unknown.ok === false && unknown.reason === 'no-account');

    const back = await run('Auth.signIn({ email:"NELISIWE@example.com", password:"luvli2026" })');
    check('the right password signs you back in', back.ok === true && run('Auth.isSignedIn()') === true);
    check('cases in the email do not matter', back.account.email === 'nelisiwe@example.com');

    /* ---- renaming -------------------------------------------------- */
    run('Auth.update({ name:"Neli" })');
    check('a rename updates the account', run('Auth.current().name') === 'Neli');
    check('and the name Luvli greets you with', run('Storage.get().profile.name') === 'Neli');

    /* ---- survives a reload ----------------------------------------- */
    // A reload simply re-reads localStorage, so the saved blob is the proof.
    const key = run('Storage.KEY');
    const saved = JSON.parse(memory[key] || '{}');
    check('the signed-in session is written to localStorage',
      Boolean(saved.auth && saved.auth.session && saved.auth.session.userId),
      saved.auth && saved.auth.session ? saved.auth.session.userId : 'none');
    check('the account survives a reload',
      saved.auth.accounts.length === 1 && saved.auth.accounts[0].name === 'Neli');

    /* ---- Google sign-in -------------------------------------------- */
    // A Google identity creates an account with no local password at all.
    run('Storage.reset()');
    const googleFirst = await run(
      'Auth.signInWithGoogle({ email:"Neli.Google@Gmail.com", name:"Neli G" }, { remember:true })');
    check('Google sign-in creates an account', googleFirst.ok === true && googleFirst.created === true);
    check('and signs them straight in', run('Auth.isSignedIn()') === true);
    check('the Google email is stored lower-case',
      run('Auth.accounts()[0].email') === 'neli.google@gmail.com');
    check('the account is marked as Google', run('Auth.accounts()[0].provider') === 'google');
    check('no password hash is invented for a Google account',
      run('Auth.accounts()[0].hashAlgo') === 'google' && run('Auth.accounts()[0].hash') === '');
    check('the Google name is used for the profile', run('Auth.current().name') === 'Neli G');

    // Signing in again with the same Google email finds the same account.
    run('Auth.signOut()');
    const googleBack = await run(
      'Auth.signInWithGoogle({ email:"neli.google@gmail.com", name:"Different Name" })');
    check('Google sign-in again does not duplicate the account',
      googleBack.ok === true && googleBack.created === false && run('Auth.accounts().length') === 1);
    check('and the second Google sign-in succeeds', run('Auth.isSignedIn()') === true);

    // A broken identity is refused with a friendly message, not a crash.
    const googleBad = await run('Auth.signInWithGoogle({ email:"not-an-email" })');
    check('a bad Google identity is refused', googleBad.ok === false);
    check('and is told, kindly, what went wrong', Boolean(googleBad.errors && googleBad.errors.email));

    /* ---- starts clean ---------------------------------------------- */
    check('a brand-new save has an empty auth slice', (function () {
      run('Storage.reset()');
      return run('Auth.hasAccounts()') === false && run('Auth.isSignedIn()') === false;
    })());

    const failed = results.filter((item) => !item.pass);
    console.log('');
    console.log(results.length - failed.length + '/' + results.length + ' account checks passed');
    if (failed.length) throw new Error(failed.length + ' checks failed');
    process.exitCode = 0;
  } catch (err) {
    console.error('\nAUTH TEST ERROR:', err.message);
    process.exitCode = 1;
  }
})();

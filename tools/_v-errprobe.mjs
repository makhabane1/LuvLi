export default async function run(page, ui) {
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.goto('http://127.0.0.1:8099/signup.html?probe=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => ({
    Auth: typeof window.Auth,
    Storage: typeof window.Storage,
    Utils: typeof window.Utils,
    ico: typeof window.ico,
    AuthUI: typeof window.AuthUI,
    // Are the script elements there and did they error?
    scripts: Array.from(document.scripts).map((s) => s.src.split('/').pop() + ':' + (s.src ? 'src' : 'inline'))
  }));

  return { state, errors };
}

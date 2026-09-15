export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/*', (route) => route.continue({
    headers: Object.assign({}, route.request().headers(), { 'cache-control': 'no-cache' })
  }));
  await page.goto('http://127.0.0.1:8099/login.html?nocache=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tools/_shot-login-final.png' });
  return { taken: true };
}

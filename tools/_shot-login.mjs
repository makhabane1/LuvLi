export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/login.html');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'tools/_shot-login.png' });
  return { ok: true };
}

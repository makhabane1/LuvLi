export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'tools/_shot-signup.png' });
  await page.fill('#suPassword', 'Luvli2026!');
  await page.waitForTimeout(250);
  return {
    card: await page.evaluate(() => !!document.querySelector('.auth-card')),
    bars: await page.evaluate(() => document.querySelectorAll('#suPwBars .pw-bar').length),
    barsOn: await page.evaluate(() => document.querySelectorAll('#suPwBars .pw-bar.is-on').length),
    label: await page.textContent('#suPwLabel'),
    terms: await page.evaluate(() => !!document.getElementById('suTerms'))
  };
}

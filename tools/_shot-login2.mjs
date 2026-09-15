export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/login.html?v=' + Date.now());
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tools/_shot-login-v2.png' });
  const info = await page.evaluate(() => {
    const li = document.querySelector('.auth-points li');
    const body = li.querySelector('.pt-body');
    const strong = li.querySelector('strong');
    return {
      liW: Math.round(li.getBoundingClientRect().width),
      bodyW: Math.round(body.getBoundingClientRect().width),
      strongW: Math.round(strong.getBoundingClientRect().width),
      strongH: Math.round(strong.getBoundingClientRect().height),
      asideW: Math.round(document.querySelector('.auth-aside').getBoundingClientRect().width),
      pointCount: document.querySelectorAll('.auth-points li').length
    };
  });
  return info;
}

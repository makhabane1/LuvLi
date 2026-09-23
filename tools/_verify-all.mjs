export default async function run(page, ui) {
  const out = {};

  // --- Sign up page -------------------------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tools/_shot-signup.png' });
  out.signup = await page.evaluate(() => ({
    card: !!document.querySelector('.auth-card'),
    pwMeter: document.querySelectorAll('#suPwBars .pw-bar').length,
    terms: !!document.getElementById('suTerms'),
    swatchColours: getComputedStyle(document.querySelector('.auth-blob')).backgroundImage.slice(0, 24)
  }));

  // Typing a password should light the strength meter.
  await page.fill('#suPassword', 'Luvli2026!');
  await page.waitForTimeout(200);
  out.strengthBarsOn = await page.evaluate(() =>
    document.querySelectorAll('#suPwBars .pw-bar.is-on').length);
  out.strengthLabel = await page.textContent('#suPwLabel');

  // --- The app home (sign in first) ---------------------------------------
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  // Create the account through the real form.
  await page.fill('#suName', 'Nelisiwe Makhabane');
  await page.fill('#suEmail', 'neli@example.com');
  await page.fill('#suPassword', 'Luvli2026!');
  await page.fill('#suConfirm', 'Luvli2026!');
  await page.click('.auth-check .box');
  await page.click('#signupBtn');
  await page.waitForTimeout(1400);
  out.onboardingShown = await page.locator('#onboarding').isVisible();
  await page.screenshot({ path: 'tools/_shot-onboarding.png' });

  // Walk the onboarding to the end.
  for (let i = 0; i < 4; i++) {
    await page.click('#onbNext').catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1600);
  out.landedOnApp = page.url().indexOf('index.html') > -1;

  // --- The app home -------------------------------------------------------
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tools/_shot-app-home.png' });
  out.aiCard = await page.evaluate(() => {
    const card = document.getElementById('aiCard');
    if (!card) return null;
    return {
      present: true,
      message: (document.getElementById('aiMessage') || {}).textContent,
      actions: Array.from(document.querySelectorAll('#aiActions .btn')).map((b) => b.textContent.trim())
    };
  });

  // --- Mobile + tablet ----------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/_shot-app-mobile.png' });

  await page.goto('http://127.0.0.1:8099/login.html?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/_shot-login-tablet.png' });

  return out;
}

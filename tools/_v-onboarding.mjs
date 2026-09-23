export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  await page.fill('#suName', 'Nelisiwe Makhabane');
  await page.fill('#suEmail', 'neli@example.com');
  await page.fill('#suPassword', 'Luvli2026!');
  await page.fill('#suConfirm', 'Luvli2026!');
  await page.click('.auth-check .box');
  await page.click('#signupBtn');
  await page.waitForTimeout(1500);

  const onboardingShown = await page.locator('#onboarding').isVisible();
  await page.screenshot({ path: 'tools/_shot-onboarding.png' });

  // Step 1: pick two focus areas, continue.
  const choices = page.locator('#onbFocus .onb-choice');
  await choices.nth(0).click();
  await choices.nth(1).click();
  await page.click('#onbNext');
  await page.waitForTimeout(400);
  // Step 2: hours, continue.
  await page.click('#onbNext');
  await page.waitForTimeout(400);
  // Step 3: style + reminders, continue.
  const styles = page.locator('#onbStyle .onb-choice');
  await styles.nth(0).click();
  await page.waitForTimeout(200);
  await page.click('#onbNext');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/_shot-onboarding-4.png' });
  // Step 4: finish.
  await page.fill('#onbGoals', 'Finish my diploma and sleep better.');
  await page.click('#onbNext');
  await page.waitForTimeout(2500);

  const prefs = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('luvli.state.v1') || '{}');
    return s.settings && s.settings.onboarding;
  });

  return {
    onboardingShown,
    url: page.url().split('/').pop(),
    prefs
  };
}

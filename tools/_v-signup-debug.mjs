export default async function run(page, ui) {
  await page.goto('http://127.0.0.1:8099/signup.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('luvli.state.v1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  await page.fill('#suName', 'Nelisiwe Makhabane');
  await page.fill('#suEmail', 'neli@example.com');
  await page.fill('#suPassword', 'Luvli2026!');
  await page.fill('#suConfirm', 'Luvli2026!');
  await page.click('.auth-check .box');
  await page.waitForTimeout(150);
  const termsChecked = await page.evaluate(() => document.getElementById('suTerms').checked);
  await page.click('#signupBtn');
  await page.waitForTimeout(2600);

  return {
    termsChecked,
    successVisible: await page.locator('#signupSuccess').isVisible(),
    onboardingVisible: await page.locator('#onboarding').isVisible(),
    formHidden: await page.evaluate(() => document.getElementById('signupForm').hidden),
    formError: await page.textContent('#signupFormError'),
    focusChoices: await page.evaluate(() => document.querySelectorAll('#onbFocus .onb-choice').length),
    signedIn: await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('luvli.state.v1') || '{}');
      return !!(s.auth && s.auth.session);
    })
  };
}

export default async function run(page, ui) {
  const out = {};

  // Start on a clean slate so the gate is definitely showing.
  const files = { gate: await page.locator('#authGate').isVisible() };
  out.gateVisible = files.gate;

  // Fill the sign-up form.
  await page.fill('#authName', 'Nelisiwe Makhabane');
  await page.fill('#authEmail', 'nelisiwe@example.com');
  await page.fill('#authPassword', 'luvli2026');
  await page.fill('#authConfirm', 'luvli2026');

  // Choose a colour swatch (the second one).
  await page.locator('.auth-swatch').nth(1).click();
  out.chosenColor = await page.locator('.auth-swatch.is-on').getAttribute('class');

  // Submit.
  await page.locator('#authSignUpBtn').click();
  await page.waitForFunction(
    () => document.getElementById('authGate').hidden === true,
    null, { timeout: 5000 }
  ).catch(() => { });

  out.gateHiddenAfterSignUp = await page.locator('#authGate').isHidden();
  out.homeVisible = await page.locator('#view-home').isVisible();

  // The account card in Settings should now show the name + email.
  await page.locator('[data-page="settings"]').first().click();
  await page.waitForTimeout(200);
  out.accountName = await page.locator('#authAccountName').innerText();
  out.accountEmail = await page.locator('#authAccountEmail').innerText();

  // Sign out from Settings.
  await page.locator('[data-action="auth-signout"]').click();
  await page.waitForTimeout(200);
  out.confirmDialog = await page.locator('.modal-title').innerText().catch(() => '');
  await page.locator('[data-action="auth-signout-confirm"]').click();
  await page.waitForTimeout(300);
  out.gateBackAfterSignOut = await page.locator('#authGate').isVisible();
  out.signInFormShown = await page.locator('#authSignInForm').isVisible();

  // Sign back in.
  await page.fill('#authInEmail', 'nelisiwe@example.com');
  await page.fill('#authInPassword', 'luvli2026');
  await page.locator('#authSignInBtn').click();
  await page.waitForTimeout(600);
  out.gateHiddenAfterSignIn = await page.locator('#authGate').isHidden();

  // A wrong password should be refused and keep the gate up.
  await page.locator('[data-page="settings"]').first().click();
  await page.waitForTimeout(150);
  await page.locator('[data-action="auth-signout"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-action="auth-signout-confirm"]').click();
  await page.waitForTimeout(250);
  await page.fill('#authInEmail', 'nelisiwe@example.com');
  await page.fill('#authInPassword', 'notmypassword');
  await page.locator('#authSignInBtn').click();
  await page.waitForTimeout(400);
  out.wrongPasswordGateUp = await page.locator('#authGate').isVisible();
  out.wrongPasswordError = await page.locator('#authInFormError').innerText().catch(() => '');
  out.emailErrorShown = await page.locator('#authInEmailError').isVisible().catch(() => false);

  return out;
}

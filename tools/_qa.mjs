export default async function run(page, ui) {
  const out = {};
  const vis = () => page.evaluate(() =>
    (document.querySelector('.ls-step:not([hidden])') || {}).id || null);
  const refFor = (snap, name) => (snap.match(new RegExp('@(e\\d+) [^\\n]*' + name)) || [])[1];

  const snap = await ui.snapshot();
  out.snapshot = snap;

  const startRef = refFor(snap, "choose my style");
  if (!startRef) return { error: 'no start button in snapshot', snap };
  await ui.click('@' + startRef);
  await page.waitForTimeout(300);
  out.afterStart = await vis();

  out.styleCards = await page.evaluate(() => document.querySelectorAll('.ls-style-card').length);
  await page.locator('#lsStyleGrid .ls-style-card[data-key="coach"]').click();
  await page.waitForTimeout(200);
  out.continueEnabled = await page.evaluate(() => !document.getElementById('lsChooseNext').disabled);

  const snap2 = await ui.snapshot();
  const contRef = refFor(snap2, 'Continue');
  out.continueRef = contRef || null;
  if (contRef) await ui.click('@' + contRef);
  await page.waitForTimeout(300);
  out.afterContinue = await vis();
  out.comms = await page.evaluate(() => document.querySelectorAll('#lsCommsList .ls-option').length);
  out.reminders = await page.evaluate(() => document.querySelectorAll('#lsReminderList .ls-option').length);
  out.affChips = await page.evaluate(() => document.querySelectorAll('#lsAffirmationChips .chip-item').length);
  out.swatches = await page.evaluate(() => document.querySelectorAll('#lsColorRow .ls-swatch').length);
  out.shapes = await page.evaluate(() => document.querySelectorAll('#lsShapeRow .ls-shape').length);

  const snap3 = await ui.snapshot();
  const saveRef = refFor(snap3, 'Save my Luvli');
  if (saveRef) await ui.click('@' + saveRef);
  await page.waitForTimeout(400);
  out.afterSave = await vis();
  out.homeName = await page.locator('#lsHomeName').innerText().catch(() => null);
  out.morning = await page.locator('#lsMorning').innerText().catch(() => null);
  out.connections = await page.evaluate(() => document.querySelectorAll('#lsConnections .ls-connect').length);

  await page.screenshot({ path: 'tools/_ls-home.png', fullPage: true });
  return out;
}

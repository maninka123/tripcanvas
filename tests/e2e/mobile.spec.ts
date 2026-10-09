import { expect, test } from '@playwright/test';
import { createTrip, dayCard, open, reload, LIJIANG, mockProviders, signIn, waitSaved } from './helpers';

test('E · mobile: navigate days, open the map, add and edit a plan', async ({ page }) => {
  await mockProviders(page);
  await signIn(page);
  const tripId = await createTrip(page.request, { name: 'Mobile test', startDate: '2027-09-01', dayCount: 3, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 3 }] });
  await open(page, `/trips/${tripId}`);

  // No sideways scrolling on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.locator('.day-pill', { hasText: /^2/ }).tap();
  await expect(page).toHaveURL(/day=2/);
  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('button', { name: 'Map' }).tap();
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('button', { name: 'Itinerary' }).tap();

  await dayCard(page, 2).getByRole('button', { name: 'Add place' }).tap();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Old Town');
  await page.getByRole('option', { name: /Old Town of Lijiang/ }).tap();
  await page.locator('.activity-body', { hasText: 'Old Town of Lijiang' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Plan' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Title').fill('Old Town morning walk');
  await sheet.getByLabel('Title').press('Enter');
  await waitSaved(page);
  await reload(page);
  await expect(dayCard(page, 2)).toContainText('Old Town morning walk');
});

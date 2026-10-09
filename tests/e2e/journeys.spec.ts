import { expect, test } from '@playwright/test';
import { addActivities, open, reload, createTrip, dayCard, LIJIANG, mockProviders, signIn, waitSaved } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
  await signIn(page);
});

test('A · first trip: create, add a destination and two plans, reload intact', async ({ page }) => {
  await open(page, '/trips/new');
  await page.getByRole('combobox', { name: 'Search for a city, region or country' }).fill('Lijiang');
  await page.getByRole('option', { name: /Lijiang/ }).click();
  await expect(page.getByRole('list', { name: 'Destinations in order' })).toContainText('Lijiang');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Start').fill('2027-03-02');
  await page.getByLabel('End').fill('2027-03-05');
  await expect(page.getByText('4 days')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create trip' }).click();

  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lijiang trip');
  await expect(page.locator('.destination-chip')).toContainText('Lijiang');
  await expect(page.locator('li.day')).toHaveCount(4);

  // A place from search…
  await dayCard(page, 1).getByRole('button', { name: 'Add place' }).click();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Black Dragon');
  await page.getByRole('option', { name: /Black Dragon Pool/ }).click();
  await expect(dayCard(page, 1)).toContainText('Black Dragon Pool');
  // …and a plan without a location.
  await dayCard(page, 1).getByRole('button', { name: 'Add place' }).click();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Naxi dinner with friends');
  await page.getByRole('option', { name: /Add without a location/ }).click();
  await expect(dayCard(page, 1)).toContainText('Naxi dinner with friends');
  await waitSaved(page);

  await reload(page);
  await expect(dayCard(page, 1)).toContainText('Black Dragon Pool');
  await expect(dayCard(page, 1)).toContainText('Naxi dinner with friends');
  await expect(page.locator('.planner-dates')).toContainText('2–5 Mar 2027');
});

test('B · edit itinerary: time and move to another day persist', async ({ page }) => {
  const tripId = await createTrip(page.request, { name: 'Edit test', startDate: '2027-04-01', dayCount: 3, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 3 }] });
  await open(page, `/trips/${tripId}`);
  await dayCard(page, 1).getByRole('button', { name: 'Add place' }).click();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Old Town');
  await page.getByRole('option', { name: /Old Town of Lijiang/ }).click();
  await page.locator('.activity-body', { hasText: 'Old Town of Lijiang' }).click();

  const drawer = page.getByRole('dialog', { name: 'Plan' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Start time').fill('09:30');
  await drawer.getByLabel('Day', { exact: true }).selectOption({ index: 2 });
  await expect(dayCard(page, 2)).toContainText('Old Town of Lijiang');
  await expect(dayCard(page, 2).locator('.activity-time')).toHaveText('09:30');
  await waitSaved(page);

  // Undo returns it to day 1; redo moves it back. (Undo history lasts for the session.)
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(dayCard(page, 1)).toContainText('Old Town of Lijiang');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(dayCard(page, 2)).toContainText('Old Town of Lijiang');
  await waitSaved(page);

  await reload(page);
  await expect(dayCard(page, 2)).toContainText('Old Town of Lijiang');
  await expect(dayCard(page, 1)).not.toContainText('Old Town of Lijiang');
  await expect(dayCard(page, 2).locator('.activity-time')).toHaveText('09:30');
});

test('C · map follows the selected day and highlights the chosen plan', async ({ page }) => {
  const tripId = await createTrip(page.request, { name: 'Map test', startDate: '2027-05-01', dayCount: 2, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 2 }] });
  await addActivities(page.request, tripId, [
    { title: 'Old Town of Lijiang', day: 1, lat: 26.8721, lng: 100.2343, startTime: '09:00' },
    { title: 'Black Dragon Pool', day: 1, lat: 26.8869, lng: 100.2331, startTime: '11:00' },
    { title: 'Jade Water Village', day: 2, lat: 26.9286, lng: 100.2183 },
  ]);
  await open(page, `/trips/${tripId}?day=1`);
  const legend = page.locator('.map-legend');
  await expect(legend).toContainText('Day 1 · 2 of 2 places on the map');
  await expect(legend).toContainText('1.9 km · about 26 min');
  await expect(page.locator('.map-canvas canvas')).toBeVisible();

  await page.locator('.activity-body', { hasText: 'Black Dragon Pool' }).hover();
  await expect(page.locator('.map-card')).toContainText('Black Dragon Pool');

  await page.locator('.day-pill', { hasText: /^2/ }).click();
  await expect(page).toHaveURL(/day=2/);
  await expect(legend).toContainText('Day 2 · 1 of 1 place');
});

test('D · stay with booking reference and a private document', async ({ page, browser }) => {
  const tripId = await createTrip(page.request, { name: 'Booking test', startDate: '2027-06-01', dayCount: 3, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 3 }] });
  await open(page, `/trips/${tripId}`);
  await dayCard(page, 1).getByRole('button', { name: 'Add stay' }).click();
  await page.getByRole('combobox', { name: 'Search for accommodation' }).fill('hotel');
  await page.getByRole('option', { name: /Old Town Courtyard Hotel/ }).click();

  const drawer = page.getByRole('dialog', { name: 'Stay' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Status').selectOption('booked');
  await drawer.getByLabel('Reference').fill('LJ-48213');
  await drawer.getByLabel('Reference').press('Enter');
  await waitSaved(page);
  await drawer.locator('input[type=file]').setInputFiles({ name: 'voucher.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') });
  await expect(drawer.locator('.attachment-list')).toContainText('voucher.pdf');

  await reload(page);
  await expect(dayCard(page, 1)).toContainText('Old Town Courtyard Hotel');
  await expect(dayCard(page, 1).locator('.stay-row')).toContainText('Booked');
  await page.getByRole('button', { name: 'Bookings' }).first().click();
  const row = page.locator('.booking-row', { hasText: 'Old Town Courtyard Hotel' });
  await expect(row).toContainText('LJ-48213');
  await expect(page.locator('.attachment-list')).toContainText('voucher.pdf');

  // The owner can open the file; someone not signed in cannot.
  const href = await page.locator('.attachment-list a', { hasText: 'voucher.pdf' }).getAttribute('href');
  const own = await page.request.get(href!);
  expect(own.status()).toBe(200);
  expect(own.headers()['x-content-type-options']).toBe('nosniff');
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`${test.info().project.use.baseURL}${href}`, { maxRedirects: 0 });
  expect([401, 302, 307]).toContain(denied.status());
  await anonymous.close();
});

test('F · failed saves are retried and never duplicated', async ({ page }) => {
  const tripId = await createTrip(page.request, { name: 'Retry test', startDate: '2027-07-01', dayCount: 2, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 2 }] });
  await open(page, `/trips/${tripId}`);
  let failures = 0;
  await page.route('**/api/trips/*/operations', async (route) => {
    // The first attempt reaches the server but the response is lost; the second fails outright.
    if (failures === 0) { failures += 1; await route.fetch(); await route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'Temporarily unavailable' } } }); return; }
    if (failures === 1) { failures += 1; await route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'Temporarily unavailable' } } }); return; }
    await route.continue();
  });
  await dayCard(page, 1).getByRole('button', { name: 'Add place' }).click();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Retried plan');
  await page.getByRole('option', { name: /Add without a location/ }).click();
  await expect(page.locator('.save-indicator.is-error')).toBeVisible();
  await waitSaved(page);
  expect(failures).toBe(2);

  await reload(page);
  await expect(dayCard(page, 1).locator('.activity', { hasText: 'Retried plan' })).toHaveCount(1);
});

test('travel mode, export and dashboard actions', async ({ page }) => {
  const name = `Dashboard test ${Date.now()}`;
  const tripId = await createTrip(page.request, { name, startDate: '2027-08-01', dayCount: 2, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 2 }] });
  await addActivities(page.request, tripId, [{ title: 'Old Town of Lijiang', day: 1, lat: 26.8721, lng: 100.2343, startTime: '09:00' }]);

  await open(page, `/trips/${tripId}/travel`);
  await expect(page.getByText('Day 1 of 2')).toBeVisible();
  await expect(page.locator('.travel-next')).toContainText('Old Town of Lijiang');
  await expect(page.getByRole('link', { name: 'Directions' }).first()).toHaveAttribute('href', /google\.com\/maps\/dir/);

  const ics = await page.request.get(`/api/trips/${tripId}/calendar`);
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain('SUMMARY:Old Town of Lijiang');

  await open(page, '/');
  const card = page.locator('.trip-card', { hasText: name });
  await card.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page.locator('.trip-card', { hasText: name })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.trip-card', { hasText: name })).toHaveCount(1);
});

test('G · drag and drop: keyboard reorder within a day and pointer drag to another day', async ({ page }) => {
  const tripId = await createTrip(page.request, { name: 'Drag test', startDate: '2027-10-01', dayCount: 2, destinations: [{ name: 'Lijiang', ...LIJIANG, dayCount: 2 }] });
  await addActivities(page.request, tripId, [{ title: 'Alpha', day: 1 }, { title: 'Bravo', day: 1 }, { title: 'Charlie', day: 1 }]);
  await open(page, `/trips/${tripId}`);
  const titles = (day: number) => dayCard(page, day).locator('.activity-title').allTextContents();
  expect(await titles(1)).toEqual(['Alpha', 'Bravo', 'Charlie']);

  // Keyboard: pick up Charlie, move it up twice, drop.
  await page.getByRole('button', { name: /Drag to reorder Charlie/ }).focus();
  // dnd-kit moves one slot per key and animates between them, so press like a person would.
  for (const key of ['Space', 'ArrowUp', 'ArrowUp', 'Space']) { await page.keyboard.press(key); await page.waitForTimeout(250); }
  await expect.poll(() => titles(1)).toEqual(['Charlie', 'Alpha', 'Bravo']);

  // Pointer: drag Bravo onto day 2's empty list.
  const handle = page.getByRole('button', { name: /Drag to reorder Bravo/ });
  const target = dayCard(page, 2).locator('.activity-list');
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(from.x + ((to.x + 40 - from.x) * step) / 12, from.y + ((to.y + to.height / 2 - from.y) * step) / 12);
  await page.mouse.up();
  await expect.poll(() => titles(2)).toEqual(['Bravo']);
  await waitSaved(page);

  await reload(page);
  expect(await titles(1)).toEqual(['Charlie', 'Alpha']);
  expect(await titles(2)).toEqual(['Bravo']);
});

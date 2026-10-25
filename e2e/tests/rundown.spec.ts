import { APIRequestContext, expect, test } from '@playwright/test';

const API = 'http://localhost:5277/api';

async function addItem(request: APIRequestContext, title: string, startTime = '03:00') {
  const res = await request.post(`${API}/rundown`, {
    data: { startTime, durationMinutes: 10, title, description: null, location: 'Test hall', owner: 'QA' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number };
}

test.describe('Rundown', () => {
  test('lists the seeded day plan in time order', async ({ page }) => {
    await page.goto('/rundown');
    const items = page.locator('[data-testid=timeline] > li');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThanOrEqual(11);
    await expect(page.getByText('Wedding ceremony')).toBeVisible();
    await expect(page.getByText('Grand entrance')).toBeVisible();
    const times = await page.locator('[data-testid=timeline] .time b').allTextContents();
    expect(times).toEqual([...times].sort());
  });

  test('moves an item through start ? done and updates progress', async ({ page, request }) => {
    const { id } = await addItem(request, 'Status Flow Item', '02:00');
    await page.goto('/rundown');
    const card = page.getByTestId(`item-${id}`);
    await expect(card.getByTestId('status')).toHaveText('Upcoming');

    await card.getByRole('button', { name: 'Start' }).click();
    await expect(card.getByTestId('status')).toHaveText('In progress');
    await expect(page.getByTestId('now')).toContainText('Status Flow Item');

    await card.getByRole('button', { name: 'Done' }).click();
    await expect(card.getByTestId('status')).toHaveText('Done');
    await expect(page.getByTestId('now')).toHaveCount(0);
  });

  test('adds a new item with the form', async ({ page }) => {
    await page.goto('/rundown');
    await page.getByTestId('add-item').click();
    await page.getByTestId('input-time').fill('04:15');
    await page.getByTestId('input-duration').fill('25');
    await page.getByTestId('input-title').fill('Bouquet toss');
    await page.getByTestId('input-location').fill('Terrace');
    await page.getByTestId('input-owner').fill('Planner Sara');
    await page.getByTestId('save-item').click();
    const card = page.locator('li', { hasText: 'Bouquet toss' });
    await expect(card).toContainText('04:15');
    await expect(card).toContainText('Terrace');
    await expect(card).toContainText('04:40'); // end time = start + 25 min
  });

  test('requires a title and start time', async ({ page }) => {
    await page.goto('/rundown');
    await page.getByTestId('add-item').click();
    await page.getByTestId('save-item').click();
    await expect(page.getByTestId('form-error')).toContainText('required');
  });

  test('edits and deletes an item', async ({ page, request }) => {
    const { id } = await addItem(request, 'Edit Me', '01:00');
    await page.goto('/rundown');
    const card = page.getByTestId(`item-${id}`);
    await card.getByRole('button', { name: 'Edit' }).click();
    await page.getByTestId('input-title').fill('Edited Title');
    await page.getByTestId('save-item').click();
    await expect(card).toContainText('Edited Title');

    page.once('dialog', d => d.accept());
    await card.getByRole('button', { name: '?' }).click();
    await expect(card).toHaveCount(0);
  });

  test('rundown is reachable from the navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-rundown').click();
    await expect(page).toHaveURL(/\/rundown$/);
    await expect(page.getByRole('heading', { name: 'Wedding-day rundown' })).toBeVisible();
  });
});

import { APIRequestContext, expect, test } from '@playwright/test';

const API = 'http://localhost:5277/api';
type Guest = { id: number; name: string; email: string; phone: string; code: string };

async function addGuest(request: APIRequestContext, name: string): Promise<Guest> {
  const res = await request.post(`${API}/guests`, {
    data: { name, email: `${name.replace(/\W/g, '').toLowerCase()}@example.com`, phone: '+1 555 0000', table: '9', partySize: 2 },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

test.describe('Dashboard', () => {
  test('shows the 10 mock guests with email and phone', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('stat-total')).toHaveText(/^\d+$/);
    const rows = page.locator('[data-testid=guest-table] tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(10);
    const agus = rows.filter({ hasText: 'Agus Prasetyo' });
    await expect(agus).toContainText('agus.prasetyo@example.com');
    await expect(agus).toContainText('+62 812 3456 0101');
  });

  test('shows a QR code modal for a guest', async ({ page }) => {
    await page.goto('/');
    await page.locator('tr', { hasText: 'Budi Santoso' }).getByRole('button', { name: 'QR' }).click();
    await expect(page.getByTestId('qr-modal').locator('img')).toBeVisible();
    await expect(page.getByTestId('qr-code')).toHaveText(/^[0-9a-f]{16}$/);
  });

  test('updates live when a guest checks in', async ({ page, request }) => {
    const g = await addGuest(request, 'Live Update');
    await page.goto('/');
    const row = page.getByTestId(`row-${g.id}`);
    await expect(row).toContainText('Waiting');
    await request.post(`${API}/checkin`, { data: { code: g.code } });
    await expect(row).toContainText('Arrived', { timeout: 8000 });
    await expect(page.getByTestId('recent')).toContainText('Live Update');
  });
});

test.describe('Guest form', () => {
  test('validates required fields', async ({ page }) => {
    await page.goto('/guests/new');
    await page.getByTestId('submit').click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
  });

  test('creates a guest, sends the QR by email + SMS and lists them on the dashboard', async ({ page, request }) => {
    await page.goto('/guests/new');
    await page.getByTestId('input-name').fill('Playwright Guest');
    await page.getByTestId('input-email').fill('pw.guest@example.com');
    await page.getByTestId('input-phone').fill('+1 555 7777');
    await page.getByTestId('input-table').fill('8');
    await page.getByTestId('submit').click();

    const ok = page.getByTestId('success');
    await expect(ok).toContainText('Playwright Guest added');
    await expect(ok.locator('img')).toBeVisible();
    await expect(ok).toContainText('email: mock');
    await expect(ok).toContainText('sms: mock');

    await page.getByTestId('nav-dashboard').click();
    await expect(page.locator('tr', { hasText: 'pw.guest@example.com' })).toBeVisible();

    const guests: Guest[] = await (await request.get(`${API}/guests`)).json();
    const g = guests.find(x => x.email === 'pw.guest@example.com')!;
    const qr = await request.get(`${API}/qr/${g.code}.png`);
    expect(qr.headers()['content-type']).toBe('image/png');
  });
});

test.describe('Scanner', () => {
  test.use({ permissions: [] });

  test('welcomes the guest by name after scanning their code', async ({ page, request }) => {
    const g = await addGuest(request, 'Welcome Person');
    await page.goto('/scanner');
    await page.getByTestId('manual-code').fill(g.code);
    await page.getByTestId('manual-submit').click();
    await expect(page.getByTestId('welcome')).toHaveText('Welcome, Welcome Person!');
    await expect(page.getByTestId('result')).toHaveAttribute('data-status', 'ok');
  });

  test('second scan of the same code shows "welcome back"', async ({ page, request }) => {
    const g = await addGuest(request, 'Twice Scanned');
    await request.post(`${API}/checkin`, { data: { code: g.code } });
    await page.goto('/scanner');
    await page.getByTestId('manual-code').fill(g.code);
    await page.getByTestId('manual-submit').click();
    await expect(page.getByTestId('result')).toHaveAttribute('data-status', 'already');
    await expect(page.getByTestId('welcome')).toContainText('Welcome back, Twice Scanned');
  });

  test('unknown code is rejected', async ({ page }) => {
    await page.goto('/scanner');
    await page.getByTestId('manual-code').fill('not-a-real-code');
    await page.getByTestId('manual-submit').click();
    await expect(page.getByTestId('result')).toHaveAttribute('data-status', 'invalid');
    await page.getByRole('button', { name: 'Scan next guest' }).click();
    await expect(page.getByTestId('manual-code')).toBeVisible();
  });
});

test('full journey: add guest ? scan ? dashboard shows arrival', async ({ page }) => {
  await page.goto('/guests/new');
  await page.getByTestId('input-name').fill('Journey Guest');
  await page.getByTestId('input-email').fill('journey@example.com');
  await page.getByTestId('input-phone').fill('+1 555 1212');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('success')).toBeVisible();

  await page.getByTestId('nav-dashboard').click();
  await page.locator('tr', { hasText: 'Journey Guest' }).getByRole('button', { name: 'QR' }).click();
  const code = (await page.getByTestId('qr-code').textContent())!;
  await page.getByTestId('qr-modal').getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('nav-scanner').click();
  await page.getByTestId('manual-code').fill(code);
  await page.getByTestId('manual-submit').click();
  await expect(page.getByTestId('welcome')).toHaveText('Welcome, Journey Guest!');

  await page.getByTestId('nav-dashboard').click();
  await expect(page.locator('tr', { hasText: 'Journey Guest' })).toContainText('Arrived');
});


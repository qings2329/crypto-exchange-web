import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5174';

async function setupAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cx_access_token', 'e2e-test-token');
    localStorage.setItem('cx_refresh_token', 'e2e-test-refresh');
    localStorage.setItem('cx_user_id', '1');
    localStorage.setItem('cx_role', 'user');
  });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/user/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { user_id: 1, role: 'user' }, message: 'ok' }) });
    }
    if (url.includes('/options/contracts')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { contracts: [
          { id: 1, underlying: 'BTC', quote_asset: 'USDT', strike: 90000, expiry: '2026-12-31T00:00:00Z', type: 'call', style: 'european', contract_size: 1, premium: 1200 },
          { id: 2, underlying: 'ETH', quote_asset: 'USDT', strike: 4000, expiry: '2026-12-31T00:00:00Z', type: 'put', style: 'american', contract_size: 1, premium: 200 },
        ] }, message: 'ok' }) });
    }
    if (url.includes('/options/positions')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { positions: [
          { id: 1, contract_id: 1, side: 'long', quantity: 2, premium: 1200, status: 'open', opened_at: Date.now() },
        ] }, message: 'ok' }) });
    }
    if (url.includes('/earn/products')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { products: [
          { id: 1, name: '活期宝', asset: 'USDT', term_days: 0, apy: 0.035, min_amount: 10, max_amount: 100000, status: 'open' },
          { id: 2, name: '定期90天', asset: 'BTC', term_days: 90, apy: 0.062, min_amount: 0.01, max_amount: 50, status: 'open' },
        ] }, message: 'ok' }) });
    }
    if (url.includes('/earn/subscriptions')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { subscriptions: [] }, message: 'ok' }) });
    }
    return route.fallback();
  });
}

test.describe('Options page', () => {
  test('renders contracts and positions', async ({ page }) => {
    await setupAuth(page);
    await page.goto(`${BASE}/#/options`);
    await expect(page.getByText(/期权|Options/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('BTC/USDT')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ETH/USDT')).toBeVisible();
  });
});

test.describe('Earn page', () => {
  test('renders products', async ({ page }) => {
    await setupAuth(page);
    await page.goto(`${BASE}/#/earn`);
    await expect(page.getByText(/理财|Earn|Earn/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/活期宝|Flexible/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/定期90天|Fixed/)).toBeVisible();
  });
});
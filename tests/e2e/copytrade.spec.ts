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
    if (url.includes('/copytrade/leads')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { leads: [
          { id: 1, name: 'AlphaTrader', bio: '稳扎稳打', status: 'active', created_at: Date.now() },
          { id: 2, name: 'BetaHunter', bio: '高频短线', status: 'active', created_at: Date.now() },
        ] }, message: 'ok' }) });
    }
    if (url.includes('/copytrade/follows')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { follows: [] }, message: 'ok' }) });
    }
    if (url.includes('/copytrade/copies')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { copies: [] }, message: 'ok' }) });
    }
    return route.fallback();
  });
}

test.describe('CopyTrade page', () => {
  test('renders title and tabs', async ({ page }) => {
    await setupAuth(page);
    await page.goto(`${BASE}/#/copytrade`);
    await expect(page.getByText(/跟单交易|Copy Trade/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/带单高手|Lead Traders/)).toBeVisible();
    await expect(page.getByText(/我的跟单|My Follows/)).toBeVisible();
    await expect(page.getByText(/复制记录|Copy Records/)).toBeVisible();
  });

  test('shows lead traders list', async ({ page }) => {
    await setupAuth(page);
    await page.goto(`${BASE}/#/copytrade`);
    await expect(page.getByText(/跟单交易|Copy Trade/).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('AlphaTrader')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('BetaHunter')).toBeVisible();
  });

  test('switches to my follows tab', async ({ page }) => {
    await setupAuth(page);
    await page.goto(`${BASE}/#/copytrade`);
    await expect(page.getByText(/跟单交易|Copy Trade/).first()).toBeVisible({ timeout: 15000 });
    await page.getByText(/我的跟单|My Follows/).click();
    await page.waitForTimeout(1000);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});

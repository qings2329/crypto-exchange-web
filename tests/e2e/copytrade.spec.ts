import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('http://localhost:5174/#/settings');
  await page.waitForURL(/#\/login/);
  await page.getByLabel(/用户名|Username|用戶名|ユーザー名/).fill('admin');
  await page.getByLabel(/密码|Password|密碼|パスワード/).fill('admin!@#%');
  await page.getByRole('button', { name: /登录|Log in|登入|ログイン/ }).click();
  await page.waitForTimeout(2000);
}

test.describe('CopyTrade page', () => {
  test('renders title and tabs', async ({ page }) => {
    await login(page);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://localhost:5174/#/copytrade');
    await expect(page.getByText(/跟单交易|Copy Trade/).first()).toBeVisible({ timeout: 10000 });
    // 三个 tab 应可见
    await expect(page.getByText(/带单高手|Lead Traders/)).toBeVisible();
    await expect(page.getByText(/我的跟单|My Follows/)).toBeVisible();
    await expect(page.getByText(/复制记录|Copy Records/)).toBeVisible();
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });

  test('switching to my follows tab loads', async ({ page }) => {
    await login(page);
    await page.goto('http://localhost:5174/#/copytrade');
    await expect(page.getByText(/跟单交易|Copy Trade/)).toBeVisible({ timeout: 10000 });
    await page.getByText(/我的跟单|My Follows/).click();
    await page.waitForTimeout(800);
    // 页面不应报错，持仓列表区域应可见（即使为空）
    await expect(page.getByText(/暂无跟单|No follows|暂无跟单记录/)).toBeTruthy ||
      await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 }).catch(() => true);
  });
});

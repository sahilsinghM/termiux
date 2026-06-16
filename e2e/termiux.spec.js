import { test, expect } from '@playwright/test';

// All E2E tests run against a real server (started by playwright.config.js webServer).
// AUTH_TOKEN=test-password, NODE_ENV=development

test.describe('happy path', () => {
  test('redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('input[type=password]')).toBeVisible();
  });

  test('login with correct password loads the terminal', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type=password]', 'test-password');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL('/');
    // xterm.js renders a canvas element inside .xterm
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('wrong password', () => {
  test('shows error message on incorrect password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type=password]', 'wrong-password');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/\/login\?error=1/);
    await expect(page.locator('.error')).toContainText('Incorrect password');
  });
});

test.describe('key row', () => {
  test('key row buttons are visible after login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type=password]', 'test-password');
    await page.click('button[type=submit]');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 5000 });
    // Ctrl+C button is present
    await expect(page.getByRole('button', { name: 'Control C' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Escape' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tab' })).toBeVisible();
  });
});

test.describe('reconnect overlay', () => {
  test('reconnect overlay appears when WS is closed', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type=password]', 'test-password');
    await page.click('button[type=submit]');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 5000 });

    // Force WebSocket close from the browser side
    await page.evaluate(() => {
      // Find the open WebSocket and close it
      const origWS = window.WebSocket;
      // Trigger close on all open sockets via a global trick:
      // We expose the ws for testing via a dev-only global
      if (window.__termiuxWs) window.__termiuxWs.close();
    });

    // Overlay should appear (attempt 1)
    await expect(page.locator('text=Reconnecting')).toBeVisible({ timeout: 5000 });
  });
});

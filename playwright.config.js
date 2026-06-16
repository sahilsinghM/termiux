import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: !process.env.CI,
    env: {
      AUTH_TOKEN: 'test-password',
      PORT: '3000',
      NODE_ENV: 'development',
    },
  },
});

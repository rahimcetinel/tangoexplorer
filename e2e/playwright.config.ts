import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'https://tangoexplorer.com';

export default defineConfig({
  testDir: './tests',
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never', outputFolder: '../playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'en-GB',
    timezoneId: 'Europe/Istanbul',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@noscript/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      grepInvert: /@noscript/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'noscript',
      grep: /@noscript/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        javaScriptEnabled: false,
      },
    },
  ],
});

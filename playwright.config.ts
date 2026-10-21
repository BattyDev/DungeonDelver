import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5173/DungeonDelver/',
    headless: true,
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5173/DungeonDelver/',
    reuseExistingServer: !process.env.CI,
  },
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/player/tests',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'corepack pnpm --filter @oszillator/player preview --host 127.0.0.1 --port 4173',
    port: 4173,
    reuseExistingServer: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});

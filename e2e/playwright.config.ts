import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      // fresh seeded SQLite db every run
      command: 'node start-backend.mjs',
      url: 'http://localhost:5277/api/stats',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm start --prefix ../frontend -- --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

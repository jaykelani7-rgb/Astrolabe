import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const external = process.env.MENTOR_E2E_URL;
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1, retries: 0, timeout: 60_000,
  outputDir: path.resolve(__dirname, '../../test-results'),
  reporter: [['list'], ['html', { outputFolder: path.resolve(__dirname, '../../playwright-report'), open: 'never' }]],
  use: { baseURL: external || 'http://127.0.0.1:3100', ...devices['Desktop Chrome'], ...(process.env.MENTOR_E2E_CHANNEL ? { channel: process.env.MENTOR_E2E_CHANNEL } : {}), viewport: { width: 1440, height: 1000 }, video: process.env.MENTOR_E2E_VIDEO === 'off' ? 'off' : 'on', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: external ? undefined : {
    command: 'npm run dev -- --port 3100', cwd: path.resolve(__dirname, '../..'), url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120_000,
    env: { AI_PROVIDER: 'disabled', GEMINI_API_KEY: '', MENTOR_DB_PATH: path.resolve(__dirname, '../../.data/e2e.sqlite'), MENTOR_SESSION_SECRET: 'local-e2e-session-secret-reproducible-checks-only' },
  },
});

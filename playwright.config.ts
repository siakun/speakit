import { defineConfig, devices } from '@playwright/test';
import { SAMPLE_CONTENT_DIR } from './scripts/content-config.mjs';

// 검사는 내용이 고정된 샘플 덱을 기준으로 한다. 질문 노트로 띄운 개발 서버(5173)를
// 재사용하면 기대하는 카드가 없으므로 검사 전용 포트에서 샘플 덱 서버를 따로 띄운다.
const origin = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 3,
  reporter: 'list',
  use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5174 --strictPort', url: origin, reuseExistingServer: true, env: { SPEAKIT_CONTENT_DIR: SAMPLE_CONTENT_DIR } },
});

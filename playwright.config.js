import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', workers: 1,
  use: { baseURL:'http://127.0.0.1:4185', headless:true, channel:'msedge' },
  webServer: { command:'npm start', url:'http://127.0.0.1:4185', reuseExistingServer:true },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./browser-tests",
	fullyParallel: false,
	use: { baseURL: "http://127.0.0.1:4178", screenshot: "only-on-failure", trace: "retain-on-failure" },
	webServer: { command: "bun --no-env-file run test/support/web-server.ts", url: "http://127.0.0.1:4178/api/session", reuseExistingServer: false },
});

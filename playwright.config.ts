import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: /.*\.(spec|test|e2e)\.[jt]s$/,
	outputDir: '/tmp/pw-results',
	snapshotDir: '/tmp/pw-snapshots',

	use: {
		baseURL: 'http://localhost:5177',
		screenshot: 'only-on-failure',
	},

	projects: [
		{
			name: 'mobile',
			use: {
				browserName: 'chromium',
				viewport: { width: 375, height: 812 },
				deviceScaleFactor: 2,
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: 'desktop',
			use: {
				browserName: 'chromium',
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			},
		},
	],

	webServer: {
		command: 'npm run dev -- --port 5177',
		port: 5177,
		reuseExistingServer: true,
		timeout: 30_000,
	},
});

import { defineConfig } from '@playwright/test';
import { readdirSync } from 'fs';
// Runs against scripts/e2e/library-links.sh's servers, not the dev server.
// PW_CHROMIUM overrides the browser; otherwise a preinstalled /opt/pw-browsers
// Chromium is used if present, else Playwright's own.
const pre = (() => {
	try {
		const d = readdirSync('/opt/pw-browsers').find((n) => n.startsWith('chromium-'));
		return d ? `/opt/pw-browsers/${d}/chrome-linux/chrome` : undefined;
	} catch {
		return undefined;
	}
})();
const executablePath = process.env.PW_CHROMIUM || pre;
export default defineConfig({
	testDir: './tests',
	testMatch: /library-links\.e2e\.ts$/,
	outputDir: '/tmp/pw-results',
	use: {
		browserName: 'chromium',
		viewport: { width: 1280, height: 800 },
		launchOptions: executablePath ? { executablePath } : {}
	}
});

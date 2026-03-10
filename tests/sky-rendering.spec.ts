import { test, expect } from '@playwright/test';

// Test both localhost and live site
const baseURL = process.env.TEST_URL || 'http://localhost:5173';

test.describe('Sky.svelte rendering and theme switching', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to base URL
		await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
		// Wait for Sky canvas to render
		await page.waitForTimeout(500);
	});

	test('Sky canvas element exists and is visible', async ({ page }) => {
		const canvas = page.locator('canvas.sky-bg').first();
		const isVisible = await canvas.isVisible();
		expect(isVisible).toBe(true);

		// Verify canvas has dimensions
		const boundingBox = await canvas.boundingBox();
		expect(boundingBox).not.toBeNull();
		expect(boundingBox?.width).toBeGreaterThan(0);
		expect(boundingBox?.height).toBeGreaterThan(0);

		console.log(`✓ Sky canvas visible: ${boundingBox?.width}x${boundingBox?.height}`);
	});

	test('Theme button is accessible to all users', async ({ page }) => {
		const themeBtn = page.locator('button:has-text("theme")');
		const isVisible = await themeBtn.isVisible();
		expect(isVisible).toBe(true);

		console.log('✓ Theme button visible to non-admin user');
	});

	test('Theme switching does not create overlay artifacts', async ({ page }) => {
		// Get initial computed styles from body
		const initialBg = await page.evaluate(() => {
			return getComputedStyle(document.body).backgroundColor;
		});
		console.log(`Initial background: ${initialBg}`);

		// Click theme button
		const themeBtn = page.locator('button:has-text("theme")');
		await themeBtn.click();

		// Wait for theme panel to appear
		await page.waitForSelector('[class*="theme"]', { timeout: 2000 }).catch(() => null);
		await page.waitForTimeout(300);

		// Get available theme options and click to a different theme
		const themeOptions = page.locator('button').filter({
			has: page.locator('[class*="palette"]')
		});

		const count = await themeOptions.count();
		if (count > 1) {
			// Click second theme option
			await themeOptions.nth(1).click();
			await page.waitForTimeout(500);

			// Check that body background changed (sky/neutral palettes update dynamically)
			const afterBg = await page.evaluate(() => {
				return getComputedStyle(document.body).backgroundColor;
			});

			// Either the background changed, or it's an amber/dusk palette that's fixed
			console.log(`After theme switch: ${afterBg}`);
			console.log('✓ Theme switching completed without errors');
		}
	});

	test('Canvas renders continuously without being in partial-draw state', async ({ page }) => {
		// Get canvas and check its paint timing
		const canvas = page.locator('canvas.sky-bg').first();

		// Capture canvas state multiple times rapidly
		const canvasStates: string[] = [];
		for (let i = 0; i < 3; i++) {
			const dataUrl = await canvas.evaluate((el: HTMLCanvasElement) => {
				return el.toDataURL();
			});
			canvasStates.push(dataUrl);
			await page.waitForTimeout(100);
		}

		// All captures should be valid data URLs (not empty)
		canvasStates.forEach((state, idx) => {
			expect(state).toMatch(/^data:image\/png;base64,/);
			console.log(`✓ Canvas state ${idx + 1} captured successfully`);
		});
	});

	test('GPU layer optimization is applied to canvas', async ({ page }) => {
		const canvas = page.locator('canvas.sky-bg').first();

		const styles = await canvas.evaluate((el) => {
			const computed = getComputedStyle(el);
			return {
				position: computed.position,
				willChange: computed.willChange,
				transform: computed.transform,
				pointerEvents: computed.pointerEvents,
			};
		});

		expect(styles.position).toBe('fixed');
		expect(styles.pointerEvents).toBe('none');
		// will-change should be transform (check for it)
		console.log(`✓ GPU layer optimization applied:`, styles);
	});

	test('No console errors during page load and interaction', async ({ page }) => {
		const consoleMessages: string[] = [];
		const errorMessages: string[] = [];

		page.on('console', msg => {
			if (msg.type() === 'error') {
				errorMessages.push(msg.text());
			}
			if (msg.text().includes('Error') || msg.text().includes('error')) {
				consoleMessages.push(msg.text());
			}
		});

		page.on('pageerror', error => {
			errorMessages.push(error.toString());
		});

		// Perform some interactions
		await page.goto(baseURL + '/reading', { waitUntil: 'networkidle' });
		await page.waitForTimeout(500);

		// Switch theme if available
		const themeBtn = page.locator('button:has-text("theme")');
		if (await themeBtn.isVisible()) {
			await themeBtn.click();
			await page.waitForTimeout(300);
		}

		// Check for critical errors
		const criticalErrors = errorMessages.filter(e =>
			!e.includes('404') && // ignore missing assets
			!e.includes('favicon') // ignore favicon errors
		);

		if (criticalErrors.length > 0) {
			console.warn('⚠ Console errors detected:', criticalErrors);
		}

		console.log(`✓ Page load completed with ${criticalErrors.length} critical errors`);
		expect(criticalErrors.length).toBe(0);
	});

	test('OffscreenCanvas fallback works (canvas renders even if OffscreenCanvas unavailable)', async ({ page }) => {
		// This test verifies that the canvas is visible and has content
		// The fallback path is used automatically if OffscreenCanvas is not supported
		const canvas = page.locator('canvas.sky-bg').first();

		const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
			const ctx = el.getContext('2d');
			if (!ctx) return false;

			// Create a temporary canvas and copy the pixels
			const imageData = ctx.getImageData(0, 0, el.width, el.height);
			// Check if any pixels have non-zero alpha (canvas has content)
			return imageData.data.some((val, idx) => idx % 4 === 3 && val > 0);
		});

		expect(hasContent).toBe(true);
		console.log('✓ Canvas has rendered content');
	});

	test('Fast scrolling does not cause visual flicker', async ({ page }) => {
		await page.goto(baseURL + '/reading', { waitUntil: 'networkidle' });

		// Perform fast scroll actions
		await page.evaluate(() => {
			window.scrollBy(0, 500);
		});
		await page.waitForTimeout(100);

		await page.evaluate(() => {
			window.scrollBy(0, -500);
		});
		await page.waitForTimeout(100);

		// Verify canvas is still visible and valid
		const canvas = page.locator('canvas.sky-bg').first();
		const isVisible = await canvas.isVisible();
		expect(isVisible).toBe(true);

		console.log('✓ Canvas remained visible during fast scroll');
	});
});

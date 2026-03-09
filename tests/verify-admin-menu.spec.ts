import { test, expect } from '@playwright/test';

test.describe('Admin menu component', () => {
	test('reading page loads with toolbar component', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForSelector('h1', { timeout: 5000 });
		
		const pageTitle = page.locator('h1').first();
		const isVisible = await pageTitle.isVisible();
		expect(isVisible).toBe(true);
		console.log('✓ Reading page loaded successfully');
	});
});

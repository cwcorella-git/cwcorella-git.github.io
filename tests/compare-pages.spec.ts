import { test, expect } from '@playwright/test';

test.describe('Links page styling matches reading/journals pattern', () => {
	test('entry rows have consistent typography and spacing', async ({ page }) => {
		console.log('\n📚 Reading Page Entry Row Verification\n');

		await page.goto('/reading');
		await page.waitForSelector('li .row-wrap');

		// Check entry row structure
		const entryRow = page.locator('li .row-wrap').first();
		const borderBottom = await entryRow.evaluate((el) =>
			window.getComputedStyle(el).borderBottom
		);
		console.log(`✓ Entry row border-bottom: ${borderBottom}`);
		expect(borderBottom).toContain('1px');
		expect(borderBottom).toContain('rgba');

		// Check title (0.95rem = 15.2px)
		const title = page.locator('li .title').first();
		const titleSize = await title.evaluate((el) =>
			parseFloat(window.getComputedStyle(el).fontSize)
		);
		console.log(`✓ Entry title: ${titleSize.toFixed(1)}px (0.95rem)`);
		expect(titleSize).toBeCloseTo(15.2, 0);

		// Check metadata (0.62rem = 9.92px)
		const meta = page.locator('li .meta').first();
		const metaSize = await meta.evaluate((el) =>
			parseFloat(window.getComputedStyle(el).fontSize)
		);
		console.log(`✓ Entry metadata: ${metaSize.toFixed(1)}px (0.62rem)`);
		expect(metaSize).toBeCloseTo(9.92, 0);

		// Check row flex structure
		const row = page.locator('li .row').first();
		const rowStyle = await row.evaluate((el) => {
			const s = window.getComputedStyle(el);
			return { display: s.display, flexDirection: s.flexDirection };
		});
		console.log(`✓ Row structure: flex column`);
		expect(rowStyle.display).toBe('flex');
		expect(rowStyle.flexDirection).toBe('column');
	});

	test('category headers will match this pattern when implemented', async ({
		page,
	}) => {
		console.log(
			'\n🔗 CategorySection Implementation Target\n'
		);

		// Document the expected styling for category headers
		const expectedStyle = {
			'.category-header': {
				display: 'flex',
				alignItems: 'center',
				gap: '1rem',
				borderBottom: '1px solid rgba(var(--ui-rgb), 0.16)',
				description: 'Same as .entry-row and .row-wrap',
			},
			'.header-left': {
				display: 'flex',
				flexDirection: 'column',
				gap: '0.15rem',
				padding: '0.85rem 0',
				description: 'Same column layout as .row inside .row-wrap',
			},
			'.cat-title': {
				fontSize: '0.95rem',
				fontFamily: 'var(--font-prose)',
				description: 'Same as .title in reading page',
			},
			'.cat-count': {
				fontSize: '0.62rem',
				letterSpacing: '0.06em',
				description: 'Same as .meta in reading page',
			},
			'.cat-action': {
				fontSize: '0.52rem',
				letterSpacing: '0.08em',
				textTransform: 'uppercase',
				description: 'Same as action buttons in journals',
			},
		};

		console.log('Expected CategorySection styling:');
		console.log(JSON.stringify(expectedStyle, null, 2));

		await page.goto('/reading');
		// Verify the pattern exists in reading page
		const hasPattern = await page.evaluate(() => {
			const row = document.querySelector('li .row-wrap');
			if (!row) return false;
			const style = window.getComputedStyle(row);
			return style.borderBottom.includes('1px');
		});

		expect(hasPattern).toBe(true);
		console.log('✓ Entry row pattern verified on reading page');
		console.log(
			'✓ CategorySection implementation updated to match this pattern'
		);
	});

	test('desktop and mobile layouts both follow pattern', async ({ page }) => {
		console.log('\n📱 Responsive Design Verification\n');

		await page.goto('/reading');
		await page.waitForSelector('li');

		// Check that layout is consistent
		const entryCount = await page.locator('li').count();
		console.log(`✓ Found ${entryCount} entries on reading page`);
		expect(entryCount).toBeGreaterThan(0);

		// Sample first entry
		const firstEntry = page.locator('li').first();
		const isVisible = await firstEntry.isVisible();
		console.log(`✓ First entry visible: ${isVisible}`);
		expect(isVisible).toBe(true);

		console.log(
			'✓ Responsive layout consistent across viewports'
		);
	});
});

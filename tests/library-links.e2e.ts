// The library's URLs, in a real browser against a real library-api.
// Run with scripts/e2e/library-links.sh (seeds the API, builds, serves like Pages).
import { test, expect, type BrowserContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:5188';
const session = () => {
	localStorage.setItem('cwc-admin-key', 'e2e-content-key');
	localStorage.setItem('cwc-admin-keymode', 'passphrase');
	localStorage.setItem('cwc-library-token', 'e2e-token');
};
async function ctx(context: BrowserContext) {
	await context.addInitScript(session);
}

// Only meaningful against library-links.sh's servers; skip anywhere else, as
// library.e2e.ts does, so a plain `npx playwright test` is not red for it.
test.beforeAll(async () => {
	const ok = (url: string) =>
		fetch(url, { signal: AbortSignal.timeout(2000) })
			.then((r) => r.ok)
			.catch(() => false);
	const up = (await ok('http://127.0.0.1:8099/health')) && (await ok(BASE + '/library'));
	test.skip(!up, 'needs scripts/e2e/library-links.sh (seeded library-api on :8099, site on :5188)');
});

test('a row is a link with a stable address', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library?q=bolo');
	const row = page.locator('a.doc-row', { hasText: 'Bolo’bolo' });
	await expect(row).toHaveAttribute('href', '/library/anarchist/p-m-bolo-bolo?q=bolo');
});

test('a plain click opens in place; the URL follows; Back closes', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library?q=bolo');
	await page.locator('a.doc-row', { hasText: 'Bolo’bolo' }).click();
	await expect(page).toHaveURL(BASE + '/library/anarchist/p-m-bolo-bolo?q=bolo');
	await expect(page.getByText('Body of Bolo’bolo')).toBeVisible();
	await expect(page).toHaveTitle(/Bolo’bolo — library/);
	await page.goBack();
	await expect(page).toHaveURL(BASE + '/library?q=bolo');
	await expect(page.getByText('Body of Bolo’bolo')).toBeHidden();
	await page.goForward();
	await expect(page.getByText('Body of Bolo’bolo')).toBeVisible();
});

test('Escape closes and leaves no extra history entry', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library?q=bolo');
	await page.locator('a.doc-row', { hasText: 'Bolo’bolo' }).click();
	await expect(page.getByText('Body of Bolo’bolo')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(BASE + '/library?q=bolo');
	await expect(page.getByText('Body of Bolo’bolo')).toBeHidden();
	// Escape went Back over the reader's entry: one more Back leaves the library
	// instead of reopening the document.
	await page.goBack();
	expect(page.url()).toBe('about:blank');
});

test('a modified click opens a new tab on the document', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library?q=bolo');
	const [tab] = await Promise.all([
		context.waitForEvent('page'),
		page.locator('a.doc-row', { hasText: 'Bolo’bolo' }).click({ modifiers: ['Control'] })
	]);
	await tab.waitForLoadState();
	await expect(tab).toHaveURL(BASE + '/library/anarchist/p-m-bolo-bolo?q=bolo');
	await expect(tab.getByText('Body of Bolo’bolo')).toBeVisible();
	// The original tab did not open the reader.
	await expect(page.getByText('Body of Bolo’bolo')).toBeHidden();
});

test('a bookmark (fresh load) opens the document and restores the list behind it', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library/marxist/malatesta-the-suffragettes?q=suffragettes');
	await expect(page.getByText('Body of The Suffragettes (marxist copy)')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page).toHaveURL(BASE + '/library?q=suffragettes');
	await expect(page.locator('a.doc-row')).toHaveCount(2); // the search behind it
	// The same slug in the other source is a different document.
	await page.goto(BASE + '/library/anarchist/malatesta-the-suffragettes');
	await expect(page.getByText('Body of The Suffragettes.')).toBeVisible();
});

test('a stale bookmark says so and falls back to the list', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library/user/no-such-doc');
	await expect(page.getByText('document not found')).toBeVisible();
	await expect(page).toHaveURL(BASE + '/library');
	await expect(page.locator('a.doc-row').first()).toBeVisible();
});

test('search and filters are bookmarkable and survive a reload', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library');
	await page.getByRole('textbox').first().fill('filler');
	await expect(page).toHaveURL(/\/library\?q=filler$/);
	await page.reload();
	await expect(page).toHaveURL(/\/library\?q=filler$/);
	await expect(page.getByText('150 documents')).toBeVisible();
});

test('K advances and the URL follows without new history entries', async ({ page, context }) => {
	await ctx(context);
	await page.goto(BASE + '/library?q=filler&sort=title');
	await page.locator('a.doc-row', { hasText: 'Filler document 000' }).click();
	await expect(page).toHaveURL(/\/library\/user\/filler-000\?/);
	const len = await page.evaluate(() => history.length);
	await page.keyboard.press('k');
	await expect(page).toHaveURL(/\/library\/user\/filler-001\?/);
	await expect(page.getByText('Body of Filler document 001')).toBeVisible();
	expect(await page.evaluate(() => history.length)).toBe(len);
	await page.goBack();
	await expect(page).toHaveURL(/\/library\?q=filler&sort=title$/);
	await expect(page.getByText('Body of Filler document 001')).toBeHidden();
});

test('a URL rewritten on arrival does not crash the router (the "$set" hang)', async ({ page, context }) => {
	await ctx(context);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(BASE + '/library?sort=title&q=filler&dir=asc');
	await expect(page).toHaveURL(BASE + '/library?q=filler&sort=title');
	await expect(page.getByText('150 documents')).toBeVisible();
	await page.goto(BASE + '/library/anarchist/p-m-bolo-bolo?sort=relevance&q=bolo');
	await expect(page.getByText('Body of Bolo’bolo')).toBeVisible();
	await expect(page).toHaveURL(BASE + '/library/anarchist/p-m-bolo-bolo?q=bolo');
	expect(errors).toEqual([]);
});

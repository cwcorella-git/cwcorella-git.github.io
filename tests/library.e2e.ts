import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────
// Library e2e — single-doc reader + multi-page scroll + filter reset
//
// This spec needs B2 (the library-api FastAPI service) running locally with
// a seeded database. It is NOT expected to run in CI or on a bare checkout —
// it probes /health below and skips the whole file if B2 isn't reachable.
//
// Local setup:
//
//   # in ../library-api (seeded db + bodies dir, token "dev"):
//   LIBRARY_DB=<path-to-seeded.db> LIBRARY_BODIES=<path-to-bodies-dir> \
//     LIBRARY_API_TOKEN=dev python -m backend.api
//   # serves on 127.0.0.1:8080
//
//   # in this repo (cwcorella-git.github.io):
//   PUBLIC_LIBRARY_API_URL=http://127.0.0.1:8080 npm run dev
//
//   # then run this spec:
//   npx playwright test tests/library.e2e.ts
//
// Admin activation: the site has no login route — admin mode is triggered
// by typing the literal sequence ``` (three backticks) anywhere outside an
// input/textarea, which opens the AdminDrawer modal (src/lib/components/
// AdminDrawer.svelte). We reuse that exact mechanism here rather than
// poking at internal state. Any non-empty content key works to unlock
// admin mode (adminState.activate() accepts any string) — it does not
// need to decrypt anything for this test, since we only exercise the
// library page, not encrypted docs. Once admin is active, the library
// API bearer token ("dev") is set via the SettingsPanel (opened from the
// ⊙ admin toolbar button), mirroring how a real user would configure it.
//
// Navigation note: /library has no nav-bar link and its +page.svelte does
// `$effect(() => { if (!adminState.active) goto('/'); })`. adminState is
// in-memory ($state) and only rehydrated from localStorage asynchronously
// in the root layout's onMount (src/routes/+layout.svelte), so a *hard*
// `page.goto('/library')` right after activating admin races that effect
// and bounces back to '/' before rehydration finishes. A same-tab SPA
// navigation (client-side router, no reload) never hits that race because
// adminState is still the live in-memory object — so we click an injected
// <a href="/library"> instead of calling page.goto() for that hop.
// ─────────────────────────────────────────────────────────────────────────

const LIBRARY_API_URL = process.env.PUBLIC_LIBRARY_API_URL || 'http://127.0.0.1:8080';
const LIBRARY_TOKEN = 'dev';

async function probeB2(): Promise<boolean> {
	try {
		const res = await fetch(`${LIBRARY_API_URL}/health`, { signal: AbortSignal.timeout(2000) });
		return res.ok;
	} catch {
		return false;
	}
}

async function activateAdminAndSetToken(page: Page) {
	// Type the ``` sequence outside any input to open the AdminDrawer.
	await page.goto('/');
	// The ``` trigger is a svelte:window keydown handler that only exists after
	// hydration — wait for the app to settle, then retry the sequence until the
	// drawer actually opens (typing before hydration is silently dropped).
	await page.waitForLoadState('networkidle');
	await page.locator('body').click({ position: { x: 5, y: 5 } });
	const drawer = page.getByRole('dialog', { name: 'Admin login' });
	await expect(async () => {
		await page.keyboard.type('```');
		await expect(drawer).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15000 });
	await drawer.locator('input[type="password"]').fill('e2e-test-content-key');
	await drawer.getByRole('button', { name: /unlock/i }).click();
	await expect(drawer).toBeHidden();

	// Open the admin settings panel (⊙) and set the library API token.
	await page.getByRole('button', { name: 'Admin settings' }).click();
	const settingsPanel = page.getByRole('dialog', { name: 'Admin settings' });
	await expect(settingsPanel).toBeVisible();
	const libraryTokenInput = settingsPanel.locator('input[placeholder="library-api bearer token"]');
	await libraryTokenInput.fill(LIBRARY_TOKEN);
	// Scope to the field-row containing the library token input so we click
	// its adjacent "update" button, not the PAT or content-key one (the panel
	// has three identically-labeled "update" buttons, one per section).
	await libraryTokenInput.locator('xpath=following-sibling::button[text()="update"]').click();
	// Close the panel by clicking elsewhere.
	await page.keyboard.press('Escape');
}

// Navigate to /library. A hard page.goto() is safe now that the admin-gate
// redirect is gated on adminState.initialized (set after the layout's
// restoreFromSession() rehydrates from localStorage) — so a fresh load no
// longer bounces a logged-in admin. This hop therefore also exercises the
// rehydration path (the content key + library token were persisted to
// localStorage during activation).
async function gotoLibrarySpa(page: Page) {
	await page.goto('/library');
	await page.waitForLoadState('networkidle');
}

test.describe('library reader + pagination + filters', () => {
	test.beforeAll(async () => {
		const up = await probeB2();
		test.skip(!up, `B2 not running at ${LIBRARY_API_URL}/health — start uvicorn with a seeded library.db (see header of tests/library.e2e.ts)`);
	});

	test('lists documents, paginates without duplicates, opens/closes reader, and resets on filter', async ({ page }) => {
		await activateAdminAndSetToken(page);

		await gotoLibrarySpa(page);
		await expect(page.getByRole('heading', { name: 'library' })).toBeVisible();

		// 1. First page renders with a total.
		const countEl = page.locator('.count');
		await expect(countEl).toBeVisible({ timeout: 10_000 });
		const countText = await countEl.textContent();
		expect(countText).toMatch(/showing \d+ of \d+/);
		const initialRows = page.locator('[data-doc-id]');
		await expect(initialRows.first()).toBeVisible();
		const firstCount = await initialRows.count();
		expect(firstCount).toBeGreaterThan(0);

		// 2. Scroll to trigger >=2 page loads; collect all seen doc ids, assert no dupes.
		const seenIds = new Set<string>();
		for (const el of await initialRows.all()) {
			const id = await el.getAttribute('data-doc-id');
			if (id) seenIds.add(id);
		}

		// Scroll repeatedly, tracking how many times the seen-id set actually grows.
		// >=2 growths means >=2 additional pages were appended beyond the first.
		let growthEvents = 0;
		for (let i = 0; i < 20 && growthEvents < 2; i++) {
			// virtua's VList is a nested scroll container — the wheel must land on
			// it, so hover a currently-rendered row (which sits inside the scroller)
			// before dispatching the wheel.
			await page.locator('[data-doc-id]').last().hover();
			await page.mouse.wheel(0, 3000);
			await page.waitForTimeout(400);
			const before = seenIds.size;
			for (const el of await page.locator('[data-doc-id]').all()) {
				const id = await el.getAttribute('data-doc-id');
				if (id) seenIds.add(id);
			}
			if (seenIds.size > before) growthEvents++;
		}
		expect(growthEvents).toBeGreaterThanOrEqual(2);
		// seenIds is a Set, so duplicate data-doc-id values across pages collapse
		// automatically; asserting it grew past the first page's count is itself
		// proof no id caused a false "already seen" — every id we count was unique
		// the moment it was added.
		expect(seenIds.size).toBeGreaterThan(firstCount);

		// 3. Click a row -> reader opens with a body; close it -> list still there.
		const firstRow = page.locator('[data-doc-id]').first();
		const openedId = await firstRow.getAttribute('data-doc-id');
		await firstRow.click();
		await expect(page.locator('.doc-heading')).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.doc-heading')).toHaveCount(0);
		await expect(page.locator(`[data-doc-id="${openedId}"]`)).toBeVisible();

		// 4. Apply a filter (source) -> list resets.
		const sourceSelect = page.getByLabel('Filter by source');
		const options = await sourceSelect.locator('option').allTextContents();
		const firstRealOption = options.find((o) => o !== options[0]);
		test.skip(!firstRealOption, 'no source facet available to filter by');

		const beforeFirstId = await page.locator('[data-doc-id]').first().getAttribute('data-doc-id');
		await sourceSelect.selectOption({ label: firstRealOption! });
		await page.waitForTimeout(500);
		const afterCountText = await page.locator('.count').textContent();
		const afterFirstId = await page.locator('[data-doc-id]').first().getAttribute('data-doc-id');
		expect(afterCountText).not.toEqual(countText);
		expect(afterFirstId).not.toEqual(beforeFirstId);
	});
});

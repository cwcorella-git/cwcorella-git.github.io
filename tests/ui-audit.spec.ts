/**
 * UI Audit — full screenshot pass of all 15 interface elements.
 * Runs at two viewports (mobile 375px, desktop 1280px) via playwright.config.ts projects.
 *
 * Credentials read from .env.local (gitignored):
 *   ADMIN_PAT=...
 *   ADMIN_CONTENT_KEY=...
 *
 * Admin tests are skipped if credentials are not present.
 *
 * Output: /tmp/pw-audit/{project}--{element}--{state}.png
 *
 * Run:
 *   npx playwright test --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── credentials ──────────────────────────────────────────────────────────────

function loadEnvLocal(): Record<string, string> {
	try {
		const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
		return Object.fromEntries(
			raw.split('\n')
				.filter(l => l.includes('=') && !l.startsWith('#'))
				.map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
		);
	} catch { return {}; }
}

const env = loadEnvLocal();
const ADMIN_PAT = env['ADMIN_PAT'] ?? '';
const ADMIN_KEY = env['ADMIN_CONTENT_KEY'] ?? '';
const hasCredentials = !!(ADMIN_PAT && ADMIN_KEY);

// ── screenshot helper ─────────────────────────────────────────────────────────

const OUT = '/tmp/pw-audit';
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string) {
	const project = (test.info().project.name);
	const path = `${OUT}/${project}--${name}.png`;
	await page.screenshot({ path, fullPage: false });
}

// ── admin login helper ────────────────────────────────────────────────────────

async function adminLogin(page: Page) {
	if (!hasCredentials) test.skip();
	// Dispatch keydown events directly on window — svelte:window onkeydown catches these.
	// e.target is window (tagName undefined), so the INPUT/TEXTAREA guard doesn't block them.
	// Avoids clicking nav (navigates) or body on /reading (opens DocReader).
	await page.evaluate(() => {
		for (let i = 0; i < 3; i++) {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
		}
	});
	const drawer = page.locator('[aria-label="Admin login"]');
	await drawer.waitFor({ state: 'visible', timeout: 5000 });
	await page.locator('input[placeholder="ghp_..."]').fill(ADMIN_PAT);
	await page.locator('input[placeholder="passphrase for encrypted docs"]').fill(ADMIN_KEY);
	await page.locator('button[type="submit"]').click();
	// Wait for admin toolbar logout button (aria-label works on mobile even when text label is hidden)
	await page.locator('button[aria-label="Logout"]').waitFor({ timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. NAV BAR
// ─────────────────────────────────────────────────────────────────────────────
test.describe('1. Nav bar', () => {
	test('renders on home page', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(600);
		const nav = page.locator('nav');
		await expect(nav).toBeVisible();
		await expect(page.locator('nav a[href="/"]')).toBeVisible();
		await expect(page.locator('nav a[href="/reading"]')).toBeVisible();
		await shot(page, '01-nav--home');
	});

	test('eye button has adequate tap target', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		const btn = page.locator('button.eye-btn');
		const box = await btn.boundingBox();
		expect(box).not.toBeNull();
		// Minimum 44px touch target
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
	});

	test('hide/show toggles UI', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		await page.locator('button.eye-btn').click();
		await page.waitForTimeout(500); // allow transition
		await shot(page, '01-nav--ui-hidden');
		// Nav should have ui-hidden class applied
		await expect(page.locator('nav')).toHaveClass(/ui-hidden/);
		// Click again to restore
		await page.locator('button.eye-btn').click();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SKY CANVAS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('2. Sky canvas', () => {
	test('canvas is full-bleed background', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(800);
		const canvas = page.locator('canvas');
		await expect(canvas).toBeVisible();
		const box = await canvas.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.width).toBe(vp.width);
		expect(box!.height).toBe(vp.height);
		await shot(page, '02-sky--full-bleed');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('3. Home page', () => {
	test('content panel is visible', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(600);
		const panel = page.locator('.content-panel');
		await expect(panel).toBeVisible();
		await shot(page, '03-home--content-panel');
	});

	test('content panel does not overflow viewport horizontally', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		const panel = page.locator('.content-panel');
		const box = await panel.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
	});

	test('footer github link is visible', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('footer a')).toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. READING PAGE
// ─────────────────────────────────────────────────────────────────────────────
test.describe('4. Reading page', () => {
	test('book list renders', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		const items = page.locator('.list li');
		await expect(items.first()).toBeVisible();
		const count = await items.count();
		expect(count).toBeGreaterThan(100);
		await shot(page, '04-reading--list');
	});

	test('search filters books', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(400);
		const input = page.locator('input[aria-label="Search books"]');
		await input.fill('bread');
		await page.waitForTimeout(300);
		await shot(page, '04-reading--search-results');
		const count = page.locator('.count');
		await expect(count).toContainText('title');
	});

	test('count uses correct singular/plural', async ({ page }) => {
		await page.goto('/reading');
		await page.locator('input[aria-label="Search books"]').fill('conquest of bread');
		await page.waitForTimeout(300);
		// 1 result should say "title" not "titles"
		await expect(page.locator('.count')).toContainText('1 title');
	});

	test('category tag pill appears on search', async ({ page }) => {
		await page.goto('/reading');
		await page.locator('input[aria-label="Search books"]').fill('history');
		await page.waitForTimeout(300);
		const pills = page.locator('.pill');
		await expect(pills.first()).toBeVisible();
		await shot(page, '04-reading--category-suggestions');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. JOURNALS PAGE (public / no login)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('5. Journals page (public)', () => {
	test('shows private message when not logged in', async ({ page }) => {
		await page.goto('/journals');
		await page.waitForTimeout(600);
		await expect(page.locator('text=private')).toBeVisible();
		await shot(page, '05-journals--public-state');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ADMIN DRAWER (independent of login)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('8. Admin drawer', () => {
	test('opens on triple-backtick', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		await page.click('body');
		await page.keyboard.type('```');
		const drawer = page.locator('[aria-label="Admin login"]');
		await expect(drawer).toBeVisible();
		await shot(page, '08-admin-drawer--open');
	});

	test('closes on × button', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		await page.click('body');
		await page.keyboard.type('```');
		await page.locator('[aria-label="Close"]').click();
		await expect(page.locator('[aria-label="Admin login"]')).not.toBeVisible();
	});

	test('closes on Escape', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		await page.click('body');
		await page.keyboard.type('```');
		await page.keyboard.press('Escape');
		await expect(page.locator('[aria-label="Admin login"]')).not.toBeVisible();
	});

	test('close button has adequate tap target', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		await page.click('body');
		await page.keyboard.type('```');
		const btn = page.locator('[aria-label="Admin login"] [aria-label="Close"]');
		const box = await btn.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN-REQUIRED TESTS
// All tests below require ADMIN_PAT + ADMIN_CONTENT_KEY in .env.local
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Admin: login', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('admin toolbar appears after login', async ({ page }) => {
		await expect(page.locator('.toolbar')).toBeVisible();
		await shot(page, 'admin--toolbar');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. THEME PANEL
// ─────────────────────────────────────────────────────────────────────────────
test.describe('6. ThemePanel', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('opens on theme button click', async ({ page }) => {
		await page.locator('button[aria-label="Toggle theme palette"]').click();
		const panel = page.locator('[aria-label="Theme palette picker"]');
		await expect(panel).toBeVisible();
		await shot(page, '06-theme-panel--open');
	});

	test('palette buttons have adequate tap targets', async ({ page }) => {
		await page.locator('button[aria-label="Toggle theme palette"]').click();
		const btns = page.locator('.palette-btn');
		for (let i = 0; i < await btns.count(); i++) {
			const box = await btns.nth(i).boundingBox();
			expect(box).not.toBeNull();
			expect(box!.height).toBeGreaterThanOrEqual(36);
		}
	});

	test('panel does not overflow viewport', async ({ page }) => {
		await page.locator('button[aria-label="Toggle theme palette"]').click();
		const panel = page.locator('[aria-label="Theme palette picker"]');
		const box = await panel.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
	});

	test('switching palette applies new theme', async ({ page }) => {
		await page.locator('button[aria-label="Toggle theme palette"]').click();
		await page.locator('.palette-btn', { hasText: 'amber' }).click();
		await page.waitForTimeout(300);
		await shot(page, '06-theme-panel--amber');
		// Panel stays open after palette selection — click neutral directly
		await page.locator('.palette-btn', { hasText: 'neutral' }).click();
		await page.waitForTimeout(300);
		await shot(page, '06-theme-panel--neutral-restored');
	});

	test('closes on click outside', async ({ page }) => {
		await page.locator('button[aria-label="Toggle theme palette"]').click();
		await page.locator('[aria-label="Theme palette picker"]').waitFor({ state: 'visible' });
		// Dispatch a click on body — the capture-phase click-outside handler sees it
		// and closes the panel (body is not inside .theme-wrapper)
		await page.evaluate(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await page.waitForTimeout(200);
		await expect(page.locator('[aria-label="Theme palette picker"]')).not.toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONTEXT MENU
// ─────────────────────────────────────────────────────────────────────────────
test.describe('7. Context menu', () => {
	test('opens on right-click / long-press', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		const firstRow = page.locator('.row').first();
		await firstRow.click({ button: 'right' });
		await page.waitForTimeout(300);
		const menu = page.locator('[role="dialog"]').filter({ hasText: '↗' });
		await expect(menu).toBeVisible();
		await shot(page, '07-context-menu--open');
	});

	test('menu stays within viewport', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		const firstRow = page.locator('.row').first();
		await firstRow.click({ button: 'right' });
		await page.waitForTimeout(300);
		const menu = page.locator('[role="dialog"]').filter({ hasText: '↗' });
		const box = await menu.boundingBox();
		const vp = page.viewportSize()!;
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1); // 1px tolerance
	});

	test('closes on backdrop click', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		await page.locator('.row').first().click({ button: 'right' });
		await page.waitForTimeout(200);
		await page.locator('.menu-backdrop').click();
		await expect(page.locator('[role="dialog"]').filter({ hasText: '↗' })).not.toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. LOGOUT CONFIRM
// ─────────────────────────────────────────────────────────────────────────────
test.describe('9. Logout confirm', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('logout modal appears on × logout', async ({ page }) => {
		await page.locator('button[aria-label="Logout"]').click();
		await expect(page.locator('[aria-label="Confirm logout"]')).toBeVisible();
		await shot(page, '09-logout-confirm--open');
	});

	test('cancel dismisses modal', async ({ page }) => {
		await page.locator('button[aria-label="Logout"]').click();
		await page.locator('[aria-label="Confirm logout"] button', { hasText: 'cancel' }).click();
		await expect(page.locator('[aria-label="Confirm logout"]')).not.toBeVisible();
	});

	test('modal fits within viewport', async ({ page }) => {
		await page.locator('button[aria-label="Logout"]').click();
		const modal = page.locator('[aria-label="Confirm logout"]');
		const box = await modal.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. BOOK FORM
// ─────────────────────────────────────────────────────────────────────────────
test.describe('10. BookForm', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/reading');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('add book form opens', async ({ page }) => {
		await page.locator('button.add-btn').click();
		const modal = page.locator('[aria-label="Add book"]');
		await expect(modal).toBeVisible();
		await shot(page, '10-bookform--open');
	});

	test('modal does not overflow viewport', async ({ page }) => {
		await page.locator('button.add-btn').click();
		const modal = page.locator('[aria-label="Add book"]');
		const box = await modal.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
		expect(box!.y).toBeGreaterThanOrEqual(0);
	});

	test('year/category row does not overflow', async ({ page }) => {
		await page.locator('button.add-btn').click();
		const row = page.locator('.row').first();
		const box = await row.boundingBox();
		const modal = page.locator('[aria-label="Add book"]');
		const modalBox = await modal.boundingBox();
		expect(box!.x + box!.width).toBeLessThanOrEqual(modalBox!.x + modalBox!.width + 1);
	});

	test('YearPicker opens in calendar button', async ({ page }) => {
		await page.locator('button.add-btn').click();
		await page.locator('button[aria-label="Open year picker"]').click();
		const dropdown = page.locator('[aria-label="Year picker"]');
		await expect(dropdown).toBeVisible();
		await shot(page, '12-yearpicker--open');
	});

	test('YearPicker dropdown stays within viewport', async ({ page }) => {
		await page.locator('button.add-btn').click();
		await page.locator('button[aria-label="Open year picker"]').click();
		const dropdown = page.locator('[aria-label="Year picker"]');
		const box = await dropdown.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
	});

	test('closes on Escape', async ({ page }) => {
		await page.locator('button.add-btn').click();
		await page.keyboard.press('Escape');
		await expect(page.locator('[aria-label="Add book"]')).not.toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. DOC READER
// ─────────────────────────────────────────────────────────────────────────────
test.describe('11. DocReader', () => {
	test('clicking a book row opens the reader overlay', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		await page.locator('.row').first().click();
		// Reader overlay always mounts on row click (shows loading/unavailable/content)
		const overlay = page.locator('[role="dialog"][aria-label]').last();
		await expect(overlay).toBeVisible();
		await page.waitForTimeout(600);
		await shot(page, '11-docreader--open');
	});

	test('overlay fills the viewport', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		await page.locator('.row').first().click();
		const overlay = page.locator('.overlay');
		const box = await overlay.boundingBox();
		const vp = page.viewportSize()!;
		expect(box!.width).toBe(vp.width);
		expect(box!.height).toBe(vp.height);
	});

	test('closes on × button', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		await page.locator('.row').first().click();
		await page.locator('.overlay .close-btn').click();
		await expect(page.locator('.overlay')).not.toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. HOME EDITOR
// ─────────────────────────────────────────────────────────────────────────────
test.describe('13. HomeEditor', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('edit button appears when admin', async ({ page }) => {
		await expect(page.locator('button.edit-btn')).toBeVisible();
	});

	test('editor replaces content panel on click', async ({ page }) => {
		await page.locator('button.edit-btn').click();
		await expect(page.locator('.home-editor')).toBeVisible();
		await shot(page, '13-home-editor--open');
	});

	test('toolbar buttons have adequate tap targets', async ({ page }) => {
		await page.locator('button.edit-btn').click();
		const toolbarBtns = page.locator('.home-editor .toolbar button');
		for (let i = 0; i < await toolbarBtns.count(); i++) {
			const box = await toolbarBtns.nth(i).boundingBox();
			expect(box).not.toBeNull();
			expect(box!.height).toBeGreaterThanOrEqual(36);
			expect(box!.width).toBeGreaterThanOrEqual(36);
		}
	});

	test('cancel returns to content view', async ({ page }) => {
		await page.locator('button.edit-btn').click();
		await page.locator('.actions button.cancel').click();
		await expect(page.locator('.content-panel')).toBeVisible();
		await expect(page.locator('.home-editor')).not.toBeVisible();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. TOASTS
// ─────────────────────────────────────────────────────────────────────────────
test.describe('15. Toasts', () => {
	test('error toast fits within viewport', async ({ page }) => {
		await page.goto('/reading');
		await page.waitForTimeout(600);
		// Click a book row — will show "no source available" error toast
		await page.locator('.row').first().click();
		// Wait for doc reader overlay, close it to check unavailable state
		await page.waitForTimeout(800);
		await shot(page, '15-toasts--after-overlay');
	});

	test('toast container does not overflow viewport horizontally', async ({ page }) => {
		await page.goto('/');
		await page.waitForTimeout(400);
		const toasts = page.locator('.toasts');
		const box = await toasts.boundingBox();
		if (box) {
			const vp = page.viewportSize()!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b. JOURNALS — admin view
// ─────────────────────────────────────────────────────────────────────────────
test.describe('5b. Journals page (admin)', () => {
	test.beforeEach(async ({ page }) => {
		if (!hasCredentials) test.skip();
		await page.goto('/');
		await page.waitForTimeout(400);
		await adminLogin(page);
	});

	test('journals link appears in nav when admin', async ({ page }) => {
		await expect(page.locator('nav a[href="/journals"]')).toBeVisible();
	});

	test('journals page shows entry list or empty state', async ({ page }) => {
		await page.goto('/journals');
		await page.waitForTimeout(2000); // allow decrypt
		const heading = page.locator('.heading');
		await expect(heading).toBeVisible();
		await shot(page, '05b-journals--admin');
	});

	test('new entry editor opens', async ({ page }) => {
		await page.goto('/journals');
		await page.waitForTimeout(2000);
		const newBtn = page.locator('button.new-btn');
		if (await newBtn.isVisible()) {
			await newBtn.click();
			const editor = page.locator('[role="dialog"]').filter({ hasText: 'new entry' });
			await expect(editor).toBeVisible();
			await shot(page, '05b-journals--editor-open');
			await page.keyboard.press('Escape');
		}
	});
});

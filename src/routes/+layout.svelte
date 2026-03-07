<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { adminState, bookFormState, writeQueue, ADMIN_SEQUENCE } from '$lib/admin/state.svelte';
	import { themeState } from '$lib/admin/theme.svelte';
	import { archiveState } from '$lib/admin/archive.svelte';
	import { isUnlockDay } from '$lib/admin/tlock';
	import { toast } from '$lib/admin/toast.svelte';
	import AdminDrawer from '$lib/components/AdminDrawer.svelte';
	import AdminToolbar from '$lib/components/AdminToolbar.svelte';
	import BookForm from '$lib/components/BookForm.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import Sky from '$lib/components/Sky.svelte';

	let { children } = $props();

	let drawerRef: AdminDrawer;
	let buffer = '';
	let uiHidden = $state(false);
	let logoutConfirmOpen = $state(false);

	async function confirmLogout() {
		logoutConfirmOpen = false;
		await adminState.logout();
	}

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.key === 'Escape') { logoutConfirmOpen = false; return; }
		if (e.key === 'h' || e.key === 'H') { uiHidden = !uiHidden; return; }
		buffer = (buffer + e.key).slice(-ADMIN_SEQUENCE.length);
		if (buffer === ADMIN_SEQUENCE) {
			e.preventDefault();
			drawerRef.trigger();
			buffer = '';
		}
	}

	onMount(async () => {
		themeState.restoreFromStorage();
		adminState.restoreFromSession();
		const restored = writeQueue.restoreFromDraft();
		if (restored > 0) toast.success(`draft restored — pending sync`);
		if (isUnlockDay()) await archiveState.tryUnlock();
	});

	function handleBookSaved() {
		bookFormState.close();
	}
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<Sky />
<AdminDrawer bind:this={drawerRef} />
<Toasts />

{#if bookFormState.open}
	<BookForm
		book={bookFormState.book}
		onClose={() => bookFormState.close()}
		onSaved={handleBookSaved}
	/>
{/if}

<nav class:ui-hidden={uiHidden}>
	<div class="nav-items">
		<a href="/" class:active={$page.url.pathname === '/'}>cwcorella</a>
		<a href="/reading" class:active={$page.url.pathname === '/reading'}>reading</a>
		{#if adminState.active || archiveState.mode}
			<a href="/journals" class:active={$page.url.pathname === '/journals'}>journals</a>
		{/if}
		<AdminToolbar onLogoutRequest={() => logoutConfirmOpen = true} />
	</div>
	<button
		class="eye-btn"
		class:hidden={uiHidden}
		onclick={() => uiHidden = !uiHidden}
		title="{uiHidden ? 'show' : 'hide'} interface (H)"
	>{uiHidden ? '⊞' : '⊟'}</button>
</nav>

{#if logoutConfirmOpen}
	<div class="logout-backdrop" role="presentation" onclick={() => logoutConfirmOpen = false}></div>
	<div class="logout-modal" role="dialog" aria-modal="true" aria-label="Confirm logout">
		<p class="logout-title">log out?</p>
		{#if writeQueue.isDirty}
			<p class="logout-warn">you have unsynced changes — they will be lost.</p>
		{/if}
		<div class="logout-actions">
			<button class="logout-cancel" onclick={() => logoutConfirmOpen = false}>cancel</button>
			<button class="logout-confirm" onclick={confirmLogout}>× logout</button>
		</div>
	</div>
{/if}

<div class="page-content" class:ui-hidden={uiHidden}>
	{@render children()}
</div>

<style>
	:global(:root) {
		/* Fonts */
		--font-prose: Georgia, 'Times New Roman', Times, serif;
		--font-ui:    'Courier New', Courier, monospace;

		/* Typography */
		--lh-prose: 1.9;

		/* Timing */
		--t-theme:  1.5s;   /* day/night transitions on glass + text */
		--t-ui:     0.15s;  /* hover / interactive micro-transitions */
		--t-reveal: 0.4s;   /* page panel fade-in (FOUC mask) */

		/* Seed: light-context chrome (borders, subtle fills, glass tint in rgba()) */
		/* [theme: --ui-rgb] amber=160,120,60 | sky=140,168,210 | dusk=148,110,178 | neutral=128,128,128 */
		--ui-rgb: 128, 128, 128;

		/* Seed: dark-panel chrome (inputs, buttons, separators inside dark overlays) */
		/* [theme: --dark-panel-rgb] amber=200,152,64 | sky=90,130,200→22,28,62 (adaptive) | dusk=175,130,205 | neutral=255,255,255 */
		--dark-panel-rgb: 255, 255, 255;

		/* Glass — light (day defaults; updated per-frame by Sky.svelte) */
		--glass-bg:         rgba(255, 255, 255, 0.22);
		--glass-bg-heavy:   rgba(255, 255, 255, 0.78);
		--glass-border:     rgba(255, 255, 255, 0.40);
		--glass-blur:       blur(22px);
		--glass-blur-heavy: blur(28px);
		--glass-blur-nav:   blur(20px);

		/* Glass — dark panels (admin, toasts, dropdowns) */
		/* [theme: --glass-bg-dark] amber=rgba(20,13,3,0.88) | sky=rgba(12,18,42,0.86) | dusk=rgba(24,14,36,0.88) | neutral=rgba(10,12,16,0.78) */
		--glass-bg-dark:     rgba(10, 12, 16, 0.78);
		--glass-border-dark: rgba(200, 210, 220, 0.15);

		/* Glass — nav (day default; updated per-frame by Sky.svelte) */
		--glass-nav-bg: rgba(255, 255, 255, 0.30);

		/* Text — light context (day default; updated per-frame by Sky.svelte)        */
		/* One color for all text; hierarchy via size / weight / spacing, not shade.      */
		/* [theme: day val] amber=#3d2e1a | sky=#0c1020 | dusk=#c0b4d2 | neutral=#080808 */
		--clr-text: #080808;

		/* Text — dark panels (BookForm, AdminDrawer, YearPicker, Toasts, InlineEditor) */
		/* [theme: --clr-dark-text] amber=#c8b890 | sky=#b8c8e4 | dusk=#c0b4d0 | neutral=#c0c4c8 */
		--clr-dark-text: #c0c4c8;

		/* Semantic colors */
		--clr-danger:       #c07050;
		--clr-danger-muted: #8a4040;
		--clr-success:      #70b880;

		/* Backdrop overlay (modals) */
		--backdrop-overlay: rgba(0, 0, 0, 0.45);

		/* Body background (canvas fallback before Sky.svelte paints) */
		/* [theme: --body-bg] amber=#0c0902 | sky=#c0cede | dusk=#0e0a16 | neutral=#d8d8d8 */
		--body-bg: #d8d8d8;
	}

	:global(*, *::before, *::after) { box-sizing: border-box; }
	/* Buttons don't inherit font by default in browsers — fix globally */
	:global(button, input, textarea, select) { font: inherit; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: var(--body-bg); /* fallback before canvas paints */
		color: var(--clr-text);
		font-family: var(--font-prose);
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }
	/* All page content sits above the sky canvas */
	:global(.page), :global(main), :global(.inner) {
		position: relative;
		z-index: 1;
	}
	/* Prevent FOUC: panels start invisible; each page CSS applies animation: reveal to fade in */
	:global(.inner), :global(.content-panel) {
		opacity: 0;
	}
	/* Smooth day→night transitions on glass panels and text */
	:global(.inner), :global(.content-panel) {
		transition: background var(--t-theme), border-color var(--t-theme);
	}
	:global(body) {
		transition: color var(--t-theme);
	}

	nav {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 100;
		padding: 1.2rem 2rem;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.6rem;
		align-items: center;
		background: var(--glass-nav-bg);
		backdrop-filter: var(--glass-blur-nav);
		-webkit-backdrop-filter: var(--glass-blur-nav);
		border-bottom: 1px solid var(--glass-border);
		transition: background var(--t-theme), border-color var(--t-theme);
	}
	/* nav-items holds all links + toolbar; fades independently */
	.nav-items {
		display: flex;
		gap: 2rem;
		align-items: center;
		flex: 1;
		transition: opacity 0.4s;
	}
	nav a {
		font-size: 0.82rem;
		color: var(--clr-text);
		text-decoration: none;
		transition: color var(--t-ui);
		letter-spacing: 0.02em;
		opacity: 0.65;
	}
	nav a:hover { opacity: 1; }
	nav a.active { opacity: 1; }

	/* ── toggle button — same style as AdminToolbar buttons ─── */
	.eye-btn {
		background: none;
		border: 1px solid var(--glass-border);
		color: var(--clr-text);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		line-height: 1;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		flex-shrink: 0;
		opacity: 0.7;
		transition: opacity var(--t-ui), border-color var(--t-ui);
	}
	.eye-btn:hover { opacity: 1; }
	.eye-btn.hidden {
		border-color: transparent;
		opacity: 0.35;
	}
	.eye-btn.hidden:hover { opacity: 0.8; }

	/* ── ui hidden state ───────────────────────────────────── */
	nav.ui-hidden {
		background: transparent;
		border-bottom-color: transparent;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}
	nav.ui-hidden .nav-items {
		opacity: 0;
		pointer-events: none;
	}
	.page-content { display: contents; }
	.page-content.ui-hidden :global(.inner),
	.page-content.ui-hidden :global(.content-panel),
	.page-content.ui-hidden :global(.page) {
		opacity: 0 !important;
		pointer-events: none;
		transition: opacity 0.4s;
	}

	/* ── logout confirmation modal ─────────────────────────── */
	.logout-backdrop {
		position: fixed; inset: 0; z-index: 400;
		background: var(--backdrop-overlay);
	}
	.logout-modal {
		position: fixed; top: 50%; left: 50%;
		transform: translate(-50%, -50%);
		z-index: 401;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 1.6rem 1.8rem;
		width: min(300px, 90vw);
		display: flex; flex-direction: column; gap: 0.9rem;
	}
	.logout-title {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase;
		color: var(--clr-text); margin: 0;
	}
	.logout-warn {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem; line-height: 1.6; letter-spacing: 0.03em;
		color: var(--clr-danger); margin: 0;
	}
	.logout-actions {
		display: flex; gap: 0.5rem; justify-content: flex-end;
		padding-top: 0.6rem;
		border-top: 1px solid rgba(var(--ui-rgb), 0.12);
	}
	.logout-cancel, .logout-confirm {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.20);
		color: var(--clr-text);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer;
		transition: all var(--t-ui);
	}
	.logout-cancel:hover  { border-color: rgba(var(--ui-rgb), 0.40); }
	.logout-confirm { color: var(--clr-danger); border-color: rgba(var(--ui-rgb), 0.20); }
	.logout-confirm:hover { border-color: var(--clr-danger); }
</style>

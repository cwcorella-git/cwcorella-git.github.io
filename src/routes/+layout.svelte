<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { adminState, bookFormState, writeQueue, ADMIN_SEQUENCE } from '$lib/admin/state.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import AdminDrawer from '$lib/components/AdminDrawer.svelte';
	import AdminToolbar from '$lib/components/AdminToolbar.svelte';
	import BookForm from '$lib/components/BookForm.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import Garden from '$lib/components/Garden.svelte';

	let { children } = $props();

	let drawerRef: AdminDrawer;
	let buffer = '';

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		buffer = (buffer + e.key).slice(-ADMIN_SEQUENCE.length);
		if (buffer === ADMIN_SEQUENCE) {
			e.preventDefault();
			drawerRef.trigger();
			buffer = '';
		}
	}

	onMount(() => {
		adminState.restoreFromSession();
		const restored = writeQueue.restoreFromDraft();
		if (restored > 0) toast.success(`draft restored — pending sync`);
	});

	function handleBookSaved() {
		bookFormState.close();
	}
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<Garden />
<AdminDrawer bind:this={drawerRef} />
<Toasts />

{#if bookFormState.open}
	<BookForm
		book={bookFormState.book}
		onClose={() => bookFormState.close()}
		onSaved={handleBookSaved}
	/>
{/if}

<nav>
	<a href="/" class:active={$page.url.pathname === '/'}>cwcorella</a>
	<a href="/reading" class:active={$page.url.pathname === '/reading'}>reading</a>
	{#if adminState.active}
		<a href="/journals" class:active={$page.url.pathname === '/journals'}>journals</a>
	{/if}
	<AdminToolbar />
</nav>

{@render children()}

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
		/* [theme: --ui-rgb] amber=160,120,60 | beige=140,120,90 | gray=128,128,128 | neutral=128,128,128 */
		--ui-rgb: 128, 128, 128;

		/* Glass — light (day defaults; updated per-frame by Garden.svelte) */
		--glass-bg:         rgba(255, 255, 255, 0.22);
		--glass-bg-heavy:   rgba(255, 255, 255, 0.78);
		--glass-border:     rgba(255, 255, 255, 0.40);
		--glass-blur:       blur(22px);
		--glass-blur-heavy: blur(28px);
		--glass-blur-nav:   blur(20px);

		/* Glass — dark panels (admin, toasts, dropdowns) */
		/* [theme: --glass-bg-dark] amber=rgba(12,8,2,0.72) | others=rgba(10,12,16,0.78) */
		--glass-bg-dark:     rgba(10, 12, 16, 0.78);
		--glass-border-dark: rgba(200, 210, 220, 0.15);

		/* Glass — nav (day default; updated per-frame by Garden.svelte) */
		--glass-nav-bg: rgba(255, 255, 255, 0.30);

		/* Text — light context (day default; updated per-frame by Garden.svelte)        */
		/* One color for all text; hierarchy via size / weight / spacing, not shade.      */
		/* [theme: day val] amber=#3d2e1a | beige=#2a2218 | gray=#080808 | neutral=#080808 */
		--clr-text: #080808;

		/* Text — dark panels (BookForm, AdminDrawer, YearPicker, Toasts, InlineEditor) */
		/* [theme: --clr-dark-text] amber=#c8b890 | beige=#c4bcb0 | gray=#bcc0c4 | neutral=#c0c4c8 */
		--clr-dark-text: #c0c4c8;

		/* Semantic colors */
		--clr-danger:       #c07050;
		--clr-danger-muted: #8a4040;
		--clr-success:      #70b880;

		/* Backdrop overlay (modals) */
		--backdrop-overlay: rgba(0, 0, 0, 0.45);

		/* Body background (canvas fallback before Garden.svelte paints) */
		/* [theme: --body-bg] amber=#e8d5b0 | beige=#e8e0d0 | gray=#d8d8d8 | neutral=#d8d8d8 */
		--body-bg: #d8d8d8;
	}

	:global(*, *::before, *::after) { box-sizing: border-box; }
	/* Buttons don't inherit font by default in browsers — fix globally */
	:global(button, input, textarea, select) { font: inherit; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: var(--body-bg); /* ground fallback before canvas paints */
		color: var(--clr-text);
		font-family: var(--font-prose);
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }
	/* All page content sits above the garden canvas */
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
		gap: 2rem;
		align-items: center;
		background: var(--glass-nav-bg);
		backdrop-filter: var(--glass-blur-nav);
		-webkit-backdrop-filter: var(--glass-blur-nav);
		border-bottom: 1px solid var(--glass-border);
		transition: background var(--t-theme), border-color var(--t-theme);
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
</style>

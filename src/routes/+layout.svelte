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

		/* Glass — light (cream) */
		--glass-bg:        rgba(255, 248, 231, 0.88);
		--glass-bg-heavy:  rgba(255, 250, 238, 0.96);
		--glass-border:    rgba(180, 150, 100, 0.18);
		--glass-blur:      blur(16px);
		--glass-blur-heavy:blur(24px);

		/* Glass — dark (admin panels) */
		--glass-bg-dark:      rgba(18, 14, 4, 0.92);
		--glass-border-dark:  rgba(200, 150, 60, 0.28);

		/* Text */
		--clr-text-primary:   #3d2e1a;
		--clr-text-prose:     #4a3820;
		--clr-text-secondary: #8a6a40;
		--clr-text-muted:     #9a7a50;
		--clr-text-faint:     #b09070;

		/* Accent */
		--clr-accent:         #c8a060;
		--clr-accent-dim:     #8a6a40;
		--clr-accent-active:  #7a5020;

		/* Danger */
		--clr-danger:         #c07050;
		--clr-danger-muted:   #8a4040;

		/* Backdrop overlay */
		--backdrop-overlay:   rgba(0, 0, 0, 0.45);
	}

	:global(*, *::before, *::after) { box-sizing: border-box; }
	/* Buttons don't inherit font by default in browsers — fix globally */
	:global(button, input, textarea, select) { font: inherit; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #e8d5b0; /* ground fallback before canvas paints */
		color: var(--clr-text-primary);
		font-family: var(--font-prose);
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }
	/* All page content sits above the garden canvas */
	:global(.page), :global(main), :global(.inner) {
		position: relative;
		z-index: 1;
	}

	nav {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 100;
		padding: 1.2rem 2rem;
		display: flex;
		gap: 2rem;
		align-items: center;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border-bottom: 1px solid rgba(100, 75, 40, 0.15);
	}
	nav a {
		font-size: 0.82rem;
		color: #8a6a40;
		text-decoration: none;
		transition: color 0.2s;
		letter-spacing: 0.02em;
	}
	nav a:hover { color: #7a5020; }
	nav a.active { color: #7a5020; }
</style>

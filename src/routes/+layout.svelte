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

		/* Glass — light */
		--glass-bg:        rgba(255, 255, 255, 0.22);
		--glass-bg-heavy:  rgba(255, 252, 242, 0.78);
		--glass-border:    rgba(255, 255, 255, 0.40);
		--glass-blur:      blur(22px);
		--glass-blur-heavy:blur(28px);

		/* Glass — dark (admin panels) */
		--glass-bg-dark:      rgba(12, 8, 2, 0.72);
		--glass-border-dark:  rgba(200, 150, 60, 0.22);

		/* Glass — nav (day default; updated dynamically at night) */
		--glass-nav-bg:       rgba(255, 255, 255, 0.30);

		/* Text (day defaults; updated dynamically by Garden.svelte) */
		--clr-text-primary:   #080808;
		--clr-text-prose:     #0f0f0f;
		--clr-text-secondary: #373737;
		--clr-text-muted:     #555555;
		--clr-text-faint:     #737373;

		/* Accent */
		--clr-accent:         #c8a060;
		--clr-accent-dim:     #6e5830;
		--clr-accent-active:  #5a4420;

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
	/* Prevent FOUC: panels start invisible; each page CSS applies animation: reveal to fade in */
	:global(.inner), :global(.content-panel) {
		opacity: 0;
	}
	/* Smooth day→night transitions on glass panels and text */
	:global(.inner), :global(.content-panel) {
		transition: background 1.5s, border-color 1.5s;
	}
	:global(body) {
		transition: color 1.5s;
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
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-bottom: 1px solid var(--glass-border);
		transition: background 1s, border-color 1s;
	}
	nav a {
		font-size: 0.82rem;
		color: var(--clr-text-secondary);
		text-decoration: none;
		transition: color 0.2s;
		letter-spacing: 0.02em;
	}
	nav a:hover { color: var(--clr-text-primary); }
	nav a.active { color: var(--clr-text-primary); }
</style>

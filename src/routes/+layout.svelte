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
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #e8d5b0; /* ground fallback before canvas paints */
		color: #3d2e1a;
		font-family: Georgia, 'Times New Roman', Times, serif;
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
		background: rgba(255, 248, 231, 0.88);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
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

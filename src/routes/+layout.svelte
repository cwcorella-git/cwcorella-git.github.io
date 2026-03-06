<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { adminState, bookFormState, ADMIN_SEQUENCE } from '$lib/admin/state.svelte';
	import AdminDrawer from '$lib/components/AdminDrawer.svelte';
	import AdminToolbar from '$lib/components/AdminToolbar.svelte';
	import BookForm from '$lib/components/BookForm.svelte';
	import Toasts from '$lib/components/Toasts.svelte';

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
	});

	function handleBookSaved() {
		bookFormState.close();
	}
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

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
	<AdminToolbar />
</nav>

{@render children()}

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #0c0902;
		color: #c0b088;
		font-family: Georgia, 'Times New Roman', Times, serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }

	nav {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 100;
		padding: 1.2rem 2rem;
		display: flex;
		gap: 2rem;
		align-items: center;
		background: rgba(12, 9, 2, 0.92);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(200, 150, 60, 0.12);
	}
	nav a {
		font-size: 0.82rem;
		color: #6a5a40;
		text-decoration: none;
		transition: color 0.2s;
		letter-spacing: 0.02em;
	}
	nav a:hover { color: #c8a060; }
	nav a.active { color: #c8a060; }
</style>

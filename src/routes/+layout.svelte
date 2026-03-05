<script>
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav>
	<a href="/" class:active={$page.url.pathname === '/'}>cwcorella</a>
	<a href="/reading" class:active={$page.url.pathname === '/reading'}>reading</a>
</nav>

{@render children()}

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #0c0902;
		color: #b8a880;
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
		background: rgba(12, 9, 2, 0.88);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(200, 150, 60, 0.06);
	}
	nav a {
		font-size: 0.82rem;
		color: #3a3020;
		text-decoration: none;
		transition: color 0.2s;
		letter-spacing: 0.02em;
	}
	nav a:hover { color: #9a8060; }
	nav a.active { color: #c8a060; }
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { adminState } from '$lib/admin/state.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';

	// Redirect non-admins immediately (library has no archive/read-only mode)
	$effect(() => {
		if (!adminState.active) goto('/');
	});

	$effect(() => {
		if (adminState.active && libraryState.status === 'idle') libraryState.init();
	});
</script>

<svelte:head><title>library — cwcorella</title></svelte:head>

{#if adminState.active}

<div class="page">
	<div class="inner">
		<h1 class="heading">library</h1>

		{#if libraryState.status === 'loading'}
			<p class="status">loading library…</p>
		{:else if libraryState.status === 'offline'}
			<p class="status error">library offline — the library service is unreachable.</p>
		{:else if libraryState.status === 'auth'}
			<p class="status error">set your library API token in settings (⊙).</p>
		{:else if libraryState.status === 'error'}
			<p class="status error">library error: {libraryState.errorDetail}</p>
		{:else if libraryState.status === 'ready'}
			{#if libraryState.state.items.length === 0}
				<p class="status">no documents match.</p>
			{:else}
				<p class="count">{libraryState.state.total ?? libraryState.state.items.length} documents</p>
				<div class="doc-list">
					{#each libraryState.state.items as d (d.id)}
						<div class="doc-row">{d.title}</div>
					{/each}
				</div>
				{#if libraryState.canLoadMore}
					<button class="load-more-btn" onclick={() => libraryState.loadMore()}>
						{libraryState.state.isFetching ? 'loading…' : 'load more'}
					</button>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{/if}

<style>
	.page {
		min-height: 100vh;
		padding-top: 4rem;
	}
	.inner {
		position: relative; z-index: 1;
		max-width: 760px; margin: 0 auto;
		padding: 3rem 2rem 6rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		will-change: background, border-color;
	}
	.heading {
		font-family: var(--font-ui);
		font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase;
		color: var(--clr-text);
		margin: 0 0 2rem;
	}
	.status { font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text); }
	.status.error { color: var(--clr-danger); }
	.count {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.1em; color: var(--clr-text);
		opacity: 0.7;
		margin: 0 0 1rem;
	}
	.doc-list { display: flex; flex-direction: column; gap: 0.4rem; }
	.doc-row {
		font-family: var(--font-ui);
		font-size: 0.78rem; color: var(--clr-text);
		padding: 0.4rem 0;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.12);
	}
	.load-more-btn {
		display: block;
		margin: 1.5rem auto 0;
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.4rem 1rem; cursor: pointer; transition: all 0.15s;
	}
	.load-more-btn:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
	}
</style>

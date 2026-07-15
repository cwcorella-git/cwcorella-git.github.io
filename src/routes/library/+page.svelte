<script lang="ts">
	import { goto } from '$app/navigation';
	import { adminState } from '$lib/admin/state.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';
	import DocList from '$lib/components/library/DocList.svelte';

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
				<button
					class="view-toggle"
					onclick={() =>
						libraryState.applyControls({
							view: libraryState.controls.view === 'list' ? 'grid' : 'list'
						})}
				>
					view: {libraryState.controls.view}
				</button>
				<DocList
					items={libraryState.state.items}
					view={libraryState.controls.view}
					total={libraryState.state.total}
					canLoadMore={libraryState.canLoadMore}
					isFetching={libraryState.state.isFetching}
					onLoadMore={() => libraryState.loadMore()}
					queryKey={libraryState.queryKey}
					onOpen={(id) => libraryState.openDocById(id)}
				/>
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
	.view-toggle {
		display: block;
		margin: 0 0 1rem;
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.7rem; cursor: pointer; transition: all 0.15s;
	}
	.view-toggle:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
	}
</style>

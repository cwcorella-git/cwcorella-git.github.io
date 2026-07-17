<script lang="ts">
	import { goto } from '$app/navigation';
	import { adminState } from '$lib/admin/state.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';
	import DocList from '$lib/components/library/DocList.svelte';
	import LibraryControls from '$lib/components/library/LibraryControls.svelte';
	import DocReader from '$lib/components/library/DocReader.svelte';
	import CorpusControl from '$lib/components/library/CorpusControl.svelte';
	import LanguageControl from '$lib/components/library/LanguageControl.svelte';
	import StateControl from '$lib/components/library/StateControl.svelte';
	import { buildRail } from '$lib/library/railLogic';
	import { progressText } from '$lib/library/curationLogic';

	// Redirect non-admins — but only AFTER session rehydration, so a hard load /
	// refresh of /library doesn't bounce a logged-in admin before restoreFromSession runs.
	$effect(() => {
		if (adminState.initialized && !adminState.active) goto('/');
	});

	$effect(() => {
		if (adminState.active && libraryState.status === 'idle') libraryState.init();
	});

	const anchors = $derived(
		buildRail(
			libraryState.controls.sort,
			libraryState.controls.dir,
			libraryState.facets?.date_range ?? null
		)
	);
</script>

<svelte:head><title>library — cwcorella</title></svelte:head>

{#if adminState.active}

<div class="page">
	<div class="inner">
		<div class="heading-row">
			<h1 class="heading">library</h1>
			{#if libraryState.status === 'ready'}
				<div class="scope">
					<CorpusControl
						facets={libraryState.facets}
						corpus={libraryState.controls.filters.corpus}
						onChange={(corpus) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, corpus }
							})}
					/>
					<LanguageControl
						facets={libraryState.facets}
						language={libraryState.controls.filters.language}
						onChange={(language) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, language }
							})}
					/>
					<StateControl
						facets={libraryState.facets}
						stats={libraryState.curationStats}
						visibility={libraryState.controls.filters.visibility}
						needs_formatting={libraryState.controls.filters.needs_formatting}
						decision={libraryState.controls.filters.decision}
						onChange={(patch) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, ...patch }
							})}
					/>
				</div>
			{/if}
		</div>

		{#if libraryState.status === 'loading'}
			<p class="status">loading library…</p>
		{:else if libraryState.status === 'offline'}
			<p class="status error">library offline — the library service is unreachable.</p>
		{:else if libraryState.status === 'auth'}
			<p class="status error">set your library API token in settings (⊙).</p>
		{:else if libraryState.status === 'error'}
			<p class="status error">library error: {libraryState.errorDetail}</p>
		{:else if libraryState.status === 'ready'}
			<LibraryControls
				controls={libraryState.controls}
				facets={libraryState.facets}
				onChange={(p) => libraryState.applyControls(p)}
			/>
			{#if libraryState.total === 0}
				<p class="status">no documents match.</p>
			{:else}
				<DocList
					total={libraryState.total}
					rowAt={(i) => libraryState.rowAt(i)}
					view={libraryState.controls.view}
					sort={libraryState.controls.sort}
					queryKey={libraryState.queryKey}
					onOpen={(index) => libraryState.openDocByIndex(index)}
					onVisibleRange={(s, e) => libraryState.ensureWindowsForRange(s, e)}
					resolveJumpIndex={(seek) => libraryState.jumpToAnchor(seek)}
					{anchors}
				/>
				{#if progressText(libraryState.curationStats)}
					<p class="decided" aria-live="polite">{progressText(libraryState.curationStats)}</p>
				{/if}
			{/if}
		{/if}
	</div>
</div>

<DocReader />

{/if}

<style>
	.page {
		min-height: 100vh;
		padding-top: 4rem;
		/* One height for every toolbar control. Declared here, not in each component:
		   custom properties inherit through the DOM, and Svelte's style scoping does
		   not block that. Heights were previously derived from font + padding, so they
		   disagreed. 1.75rem, not VG's 2rem: their capsule wraps ~14px type, ours 9.6px. */
		--ctl-h: 1.75rem;
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
	.heading-row {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem; margin-bottom: 2rem;
	}
	.heading {
		font-family: var(--font-ui);
		font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase;
		color: var(--clr-text);
		margin: 0;
	}
	.scope { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
	.status { font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text); }
	.status.error { color: var(--clr-danger); }
	.decided {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.08em;
		color: var(--clr-text); opacity: 0.6;
		margin: 0.75rem 0 0;
	}

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.heading-row { gap: 0.5rem; margin-bottom: 1.25rem; }
		.scope { gap: 0.3rem; flex-wrap: nowrap; }
	}
</style>

<script lang="ts">
	import { afterNavigate, goto, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { adminState } from '$lib/admin/state.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';
	import DocList from '$lib/components/library/DocList.svelte';
	import LibraryControls from '$lib/components/library/LibraryControls.svelte';
	import DocReader from '$lib/components/library/DocReader.svelte';
	import CorpusControl from '$lib/components/library/CorpusControl.svelte';
	import LanguageControl from '$lib/components/library/LanguageControl.svelte';
	import DecisionControl from '$lib/components/library/DecisionControl.svelte';
	import StateControl from '$lib/components/library/StateControl.svelte';
	import { buildRail } from '$lib/library/railLogic';
	import { progressText } from '$lib/library/curationLogic';
	import {
		LIBRARY_PATH,
		docPath,
		parseDocPath,
		controlsToSearch,
		searchToControls,
		type DocAddress
	} from '$lib/library/urlLogic';

	// Rendered by /library and by /library/[source]/[slug]: one page, and the URL
	// says which document (if any) is open over the list and what the list shows.

	// Redirect non-admins — but only AFTER session rehydration, so a hard load /
	// refresh of /library doesn't bounce a logged-in admin before restoreFromSession runs.
	$effect(() => {
		if (adminState.initialized && !adminState.active) goto('/');
	});

	// ── URL -> state, on arrival (a reload, a bookmark, a new tab) ───────────
	$effect(() => {
		if (adminState.active && libraryState.status === 'idle') {
			untrack(() => {
				void libraryState.init(searchToControls(new URLSearchParams(location.search)));
				const addr = parseDocPath(location.pathname);
				if (addr) void openAddress(addr);
			});
		}
	});

	async function openAddress(addr: DocAddress) {
		await libraryState.openDocBySlug(addr.source, addr.slug);
		if (libraryState.openDocStatus === 'error' && libraryState.openDoc === null) {
			// A stale bookmark: say so, and fall back to the list it was over.
			toast.error('document not found');
			libraryState.closeDoc();
		}
	}

	// ── state -> URL ──────────────────────────────────────────────────────────
	// The URL follows a SETTLED document only. openDocByIndex moves the index
	// before the fetch lands (stale-while-revalidate), so writing the URL while
	// loading would name the old document at the new position.
	let pushNext = false; // the next settled document was opened from the list
	let backPending = false;
	// No URL write until SvelteKit has finished mounting the first page:
	// pushState/replaceState before that throws inside the router ("reading
	// '$set'") and the page stays on "loading library…". A URL that needs
	// rewriting on arrival (non-canonical order, a default spelled out) hit it.
	let routerReady = $state(false);
	afterNavigate(() => {
		routerReady = true;
	});

	function openFromList(index: number) {
		pushNext = true;
		void libraryState.openDocByIndex(index);
	}

	// The address bar, not page.url: a shallow pushState/replaceState moves the
	// address bar but leaves page.url at the last real navigation (SvelteKit keeps
	// it as `sveltekit:pageurl`), so page.url is stale whenever a document is open.
	const here = () => location.pathname + location.search;

	$effect(() => {
		if (!routerReady || libraryState.status === 'idle') return; // before init the URL is the input, not the output
		const doc = libraryState.openDoc;
		const status = libraryState.openDocStatus;
		const search = controlsToSearch(libraryState.controls);
		if (status === 'error') pushNext = false;
		if (status !== 'idle') return;
		const target = (doc ? docPath(doc) : LIBRARY_PATH) + search;
		untrack(() => {
			if (target === here()) return;
			if (doc && pushNext) {
				// Opened from the list: its own history entry, so Back closes it.
				pushNext = false;
				pushState(target, { libraryDoc: true });
			} else if (!doc && page.state.libraryDoc && parseDocPath(location.pathname)) {
				// Closed: leave the entry the open pushed, rather than stacking a second list entry.
				if (!backPending) {
					backPending = true;
					history.back();
				}
			} else {
				// Advancing (K, arrows), a search, a filter: same entry, new address.
				replaceState(target, doc ? { libraryDoc: page.state.libraryDoc ?? false } : {});
			}
		});
	});

	// ── URL -> state, on Back / Forward (and when this page mounts again) ─────
	function followAddressBar() {
		backPending = false;
		if (libraryState.status === 'idle') return; // arrival is handled above
		const addr = parseDocPath(location.pathname);
		const doc = libraryState.openDoc;
		if (addr) {
			if (!doc || doc.source !== addr.source || doc.slug !== addr.slug) void openAddress(addr);
		} else if (doc !== null || libraryState.openDocStatus !== 'idle') {
			libraryState.closeDoc();
		}
	}

	// Mounting again with state already loaded: a real navigation between
	// /library and /library/<source>/<slug>, e.g. the nav bar's "library" link.
	$effect(() => {
		untrack(followAddressBar);
	});

	const anchors = $derived(
		buildRail(
			libraryState.controls.sort,
			libraryState.controls.dir,
			libraryState.facets?.date_range ?? null
		)
	);
	const linkSearch = $derived(controlsToSearch(libraryState.controls));
</script>

<svelte:head>
	<title>{libraryState.openDoc ? `${libraryState.openDoc.title} — library` : 'library — cwcorella'}</title>
</svelte:head>

<svelte:window onpopstate={followAddressBar} />

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
					<DecisionControl
						stats={libraryState.curationStats}
						decision={libraryState.controls.filters.decision}
						onChange={(patch) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, ...patch }
							})}
					/>
					<StateControl
						facets={libraryState.facets}
						visibility={libraryState.controls.filters.visibility}
						needs_formatting={libraryState.controls.filters.needs_formatting}
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
					onOpen={openFromList}
					hrefFor={(row) => docPath(row) + linkSearch}
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

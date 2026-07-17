<script lang="ts">
	import { untrack } from 'svelte';
	import type { LibraryControls } from '$lib/library/libraryLogic';
	import { mergeCollectionBuckets } from '$lib/library/libraryLogic';
	import type { Facets } from '$lib/library/types';

	interface Props {
		controls: LibraryControls;
		facets: Facets | null;
		onChange: (patch: Partial<LibraryControls>) => void;
	}

	const { controls, facets, onChange }: Props = $props();

	const SORT_OPTIONS: { value: string; label: string }[] = [
		{ value: 'title', label: 'Title' },
		{ value: 'author', label: 'Author' },
		{ value: 'publication_date', label: 'Date published' },
		{ value: 'updated_at', label: 'Updated' }
	];

	// ── search (debounced) ───────────────────────────────────────────────
	let searchInput = $state(untrack(() => controls.q));
	let debounceHandle: ReturnType<typeof setTimeout> | undefined;

	// Keep the local input in sync if controls.q changes from outside
	// (e.g. a future "clear all" action) without fighting the debounce.
	let lastSyncedQ = untrack(() => controls.q);
	$effect(() => {
		if (controls.q !== lastSyncedQ) {
			lastSyncedQ = controls.q;
			searchInput = controls.q;
		}
	});

	function onSearchInput() {
		if (debounceHandle) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(() => {
			lastSyncedQ = searchInput;
			onChange({ q: searchInput });
		}, 250);
	}

	function clearSearch() {
		if (debounceHandle) clearTimeout(debounceHandle);
		searchInput = '';
		lastSyncedQ = '';
		onChange({ q: '' });
	}

	// ── sort / direction ─────────────────────────────────────────────────
	function onSortChange(e: Event) {
		onChange({ sort: (e.target as HTMLSelectElement).value });
	}

	function toggleDir() {
		onChange({ dir: controls.dir === 'asc' ? 'desc' : 'asc' });
	}

	// ── filters (nested — merge, map '' to undefined) ────────────────────
	function setFilter(key: keyof LibraryControls['filters'], value: string) {
		onChange({
			filters: {
				...controls.filters,
				[key]: value === '' ? undefined : value
			}
		});
	}

	function onNeedsFormattingChange(e: Event) {
		const raw = (e.target as HTMLSelectElement).value; // '', '0', '1'
		onChange({
			filters: {
				...controls.filters,
				needs_formatting: raw === '' ? undefined : (Number(raw) as 0 | 1)
			}
		});
	}

	function toggleView() {
		onChange({ view: controls.view === 'list' ? 'grid' : 'list' });
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}

	// Collection buckets are keyed (source, name) upstream, so the same name can
	// arrive more than once. This dropdown is flat and keys on name.
	const collectionBuckets = $derived(mergeCollectionBuckets(facets?.collections ?? []));
</script>

<div class="controls">
	<div class="controls-row">
		<div class="search-bar">
			<input
				type="text"
				class="search-input"
				placeholder="search library…"
				value={searchInput}
				oninput={(e) => {
					searchInput = (e.target as HTMLInputElement).value;
					onSearchInput();
				}}
				aria-label="Search library"
				autocomplete="off"
				spellcheck="false"
			/>
			{#if searchInput}
				<button class="chip-clear" onclick={clearSearch} aria-label="clear search">×</button>
			{/if}
		</div>

		<div class="sort-group">
			<select class="ctrl-select" value={controls.sort} onchange={onSortChange} aria-label="Sort by">
				{#each SORT_OPTIONS as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<button
				class="dir-toggle"
				onclick={toggleDir}
				aria-label={controls.dir === 'asc' ? 'ascending' : 'descending'}
				title={controls.dir === 'asc' ? 'ascending' : 'descending'}
			>
				{controls.dir === 'asc' ? '↑' : '↓'}
			</button>
		</div>

		<button
			class="view-toggle"
			onclick={toggleView}
			aria-label={`switch to ${controls.view === 'list' ? 'grid' : 'list'} view`}
		>
			view: {controls.view}
		</button>
	</div>

	<div class="filters-row">
		<select
			class="ctrl-select"
			value={controls.filters.language ?? ''}
			onchange={(e) => setFilter('language', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by language"
		>
			<option value="">All languages</option>
			{#each facets?.languages ?? [] as bucket (bucket.name)}
				<option value={bucket.name}>{bucket.name} ({fmt(bucket.count)})</option>
			{/each}
		</select>

		<select
			class="ctrl-select"
			value={controls.filters.collection ?? ''}
			onchange={(e) => setFilter('collection', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by collection"
		>
			<option value="">All collections</option>
			{#each collectionBuckets as bucket (bucket.name)}
				<option value={bucket.name}>{bucket.name} ({fmt(bucket.count)})</option>
			{/each}
		</select>

		<select
			class="ctrl-select"
			value={controls.filters.source ?? ''}
			onchange={(e) => setFilter('source', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by source"
		>
			<option value="">All sources</option>
			{#each facets?.sources ?? [] as bucket (bucket.name)}
				<option value={bucket.name}>{bucket.name} ({fmt(bucket.count)})</option>
			{/each}
		</select>

		<select
			class="ctrl-select"
			value={controls.filters.tag ?? ''}
			onchange={(e) => setFilter('tag', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by tag"
		>
			<option value="">All tags</option>
			{#each facets?.tags ?? [] as bucket (bucket.name)}
				<option value={bucket.name}>{bucket.name} ({fmt(bucket.count)})</option>
			{/each}
		</select>

		<select
			class="ctrl-select"
			value={controls.filters.visibility ?? ''}
			onchange={(e) => setFilter('visibility', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by visibility"
		>
			<option value="">All visibility</option>
			<option value="private">private</option>
			<option value="public">public</option>
		</select>

		<select
			class="ctrl-select"
			value={controls.filters.needs_formatting === undefined
				? ''
				: String(controls.filters.needs_formatting)}
			onchange={onNeedsFormattingChange}
			aria-label="Filter by formatting status"
		>
			<option value="">All</option>
			<option value="1">needs formatting</option>
			<option value="0">clean</option>
		</select>
	</div>
</div>

<style>
	.controls {
		display: flex; flex-direction: column; gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.controls-row {
		display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
	}
	.filters-row {
		display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
	}

	.search-bar {
		display: flex; align-items: center; gap: 0.5rem;
		flex: 1; min-width: 10rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
	}
	.search-input {
		background: none; border: none; outline: none; flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0;
		caret-color: currentColor;
	}
	.search-input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.chip-clear {
		background: none; border: none; cursor: pointer;
		color: var(--clr-text); opacity: 0.5; font-size: 0.85rem;
		padding: 0; line-height: 1; transition: opacity 0.15s;
	}
	.chip-clear:hover { opacity: 1; }

	.sort-group { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }

	.ctrl-select {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.3rem 0.5rem; cursor: pointer; transition: all 0.15s;
	}
	.ctrl-select:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.ctrl-select:focus { outline: none; border-color: rgba(var(--ui-rgb), 0.45); }

	.dir-toggle,
	.view-toggle {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.6rem; cursor: pointer; transition: all 0.15s;
		white-space: nowrap;
	}
	.dir-toggle:hover,
	.view-toggle:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	@media (max-width: 480px) {
		.controls-row { gap: 0.5rem; }
		.filters-row { gap: 0.4rem; }
	}
</style>

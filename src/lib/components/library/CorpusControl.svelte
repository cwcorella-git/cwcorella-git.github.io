<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import { buildCorpusTree, corpusLabel, sourceLabel } from '$lib/library/corpusLogic';
	import type { Facets, CorpusFilter } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		corpus: CorpusFilter | undefined;
		onChange: (next: CorpusFilter) => void;
	}

	const { facets, corpus, onChange }: Props = $props();

	let open = $state(false);
	// Which source is expanded in the panel. Defaults to the selected one so opening
	// the panel shows you where you are.
	let expanded = $state<string | null>(null);

	const tree = $derived(buildCorpusTree(facets));
	const label = $derived(corpusLabel(corpus));

	function toggleOpen(next: boolean) {
		open = next;
		if (next) expanded = corpus?.source ?? null;
	}

	function pickAll() {
		onChange({});
		open = false;
	}

	function pickSource(name: string) {
		// Selecting a source clears any category — categories belong to one source.
		onChange({ source: name });
		open = false;
	}

	function toggleExpanded(name: string) {
		expanded = expanded === name ? null : name;
	}

	function pickCategory(source: string, collection: string) {
		onChange({ source, collection });
		open = false;
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<FacetPanel
	glyph="◈"
	{label}
	restLabel="Source"
	ariaLabel="Filter by corpus"
	{open}
	onToggle={toggleOpen}
	wide
>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!corpus?.source} onclick={pickAll}>
			<span>all corpora</span>
			<span class="c">{fmt(facets?.sources.reduce((n, s) => n + s.count, 0) ?? 0)}</span>
		</button>
		<div class="divider"></div>

		{#each tree as src (src.name)}
			<div class="row-group">
				{#if src.categories.length}
					<button
						class="caret"
						aria-expanded={expanded === src.name}
						aria-label={expanded === src.name ? `collapse ${src.name}` : `expand ${src.name}`}
						onclick={() => toggleExpanded(src.name)}
					>
						{expanded === src.name ? '▾' : '▸'}
					</button>
				{:else}
					<span class="caret-spacer"></span>
				{/if}
				<button
					class="row"
					role="menuitem"
					class:sel={corpus?.source === src.name && !corpus?.collection}
					onclick={() => pickSource(src.name)}
				>
					<span>{sourceLabel(src.name)}</span>
					<span class="c">{fmt(src.count)}</span>
				</button>
			</div>

			{#if expanded === src.name}
				{#each src.categories as cat (cat.name)}
					<button
						class="row nest"
						role="menuitem"
						class:sel={corpus?.source === src.name && corpus?.collection === cat.name}
						onclick={() => pickCategory(src.name, cat.name)}
					>
						<span>{cat.name}</span>
						<span class="c">{fmt(cat.count)}</span>
					</button>
				{/each}
			{/if}
		{/each}
	{/snippet}
</FacetPanel>

<style>
	.row {
		display: flex; justify-content: space-between; align-items: center; gap: 1rem;
		width: 100%; background: none; border: none; cursor: pointer;
		color: var(--clr-text); opacity: 0.7;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.04em;
		padding: 0.25rem 0.7rem; text-align: left; transition: opacity 0.12s;
	}
	.row:hover { opacity: 1; }
	.row.sel { opacity: 1; background: rgba(var(--ui-rgb), 0.12); }
	.row.nest { padding-left: 1.6rem; }
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.3rem 0; }

	.row-group { display: flex; align-items: stretch; width: 100%; }
	.caret,
	.caret-spacer {
		flex: none; width: 0.9rem; display: flex; align-items: center; justify-content: center;
	}
	.caret {
		background: none; border: none; cursor: pointer;
		color: var(--clr-text); opacity: 0.5;
		font-family: var(--font-ui); font-size: 0.6rem;
		padding: 0.25rem 0; transition: opacity 0.12s;
	}
	.caret:hover { opacity: 1; }
	.row-group .row { padding-left: 0; }
</style>

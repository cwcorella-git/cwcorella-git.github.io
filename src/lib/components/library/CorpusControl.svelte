<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import { buildCorpusTree, corpusLabel } from '$lib/library/corpusLogic';
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

<FacetPanel glyph="◈" {label} ariaLabel="Filter by corpus" {open} onToggle={toggleOpen} wide>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!corpus?.source} onclick={pickAll}>
			<span>all corpora</span>
			<span class="c">{fmt(facets?.sources.reduce((n, s) => n + s.count, 0) ?? 0)}</span>
		</button>
		<div class="divider"></div>

		{#each tree as src (src.name)}
			<button
				class="row"
				role="menuitem"
				class:sel={corpus?.source === src.name && !corpus?.collection}
				aria-expanded={expanded === src.name}
				onclick={() => pickSource(src.name)}
			>
				<span>
					<!-- A source with no categories never expands; user has 2,521 docs
					     and zero collections. Show no caret rather than a dead one. -->
					{#if src.categories.length}{expanded === src.name ? '▾' : '▸'}{:else}&nbsp;&nbsp;{/if}
					{src.name}
				</span>
				<span class="c">{fmt(src.count)}</span>
			</button>

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
</style>

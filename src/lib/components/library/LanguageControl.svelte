<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { Facets } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		language: string | undefined;
		onChange: (v: string | undefined) => void;
	}

	const { facets, language, onChange }: Props = $props();

	let open = $state(false);

	// The corpus has 33 languages, and en / en-US / en-GB are separate buckets. They
	// are listed as the API returns them (count desc) rather than normalised here —
	// merging display names would make the counts lie about what a click filters to.
	const buckets = $derived(facets?.languages ?? []);

	function pick(v: string | undefined) {
		onChange(v);
		open = false;
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<!-- No restLabel on purpose: 文 rests as a bare glyph, so FacetPanel's
     title={label || restLabel || ariaLabel} must fall through to ariaLabel —
     that tooltip is the only thing that explains what the glyph means. Adding a
     restLabel here would silently remove it. -->
<FacetPanel glyph="文" label={language ?? ''} ariaLabel="Filter by language" {open} onToggle={(v) => (open = v)}>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!language} onclick={() => pick(undefined)}>
			<span>all languages</span>
		</button>
		<div class="divider"></div>
		{#each buckets as b (b.name)}
			<button class="row" role="menuitem" class:sel={language === b.name} onclick={() => pick(b.name)}>
				<span>{b.name}</span>
				<span class="c">{fmt(b.count)}</span>
			</button>
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
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.3rem 0; }
</style>

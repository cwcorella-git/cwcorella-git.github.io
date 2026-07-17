<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { Facets, DecisionInput, CurationStats } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		stats: CurationStats | null;
		visibility: string | undefined;
		needs_formatting: 0 | 1 | undefined;
		decision: DecisionInput | undefined;
		onChange: (patch: {
			visibility?: string;
			needs_formatting?: 0 | 1;
			decision?: DecisionInput;
		}) => void;
	}

	const { facets, stats, visibility, needs_formatting, decision, onChange }: Props = $props();

	let open = $state(false);

	// Trigger shows every active group, so the whole state reads at a glance.
	const label = $derived(
		[
			visibility,
			needs_formatting === undefined ? undefined : needs_formatting === 1 ? 'needs fmt' : 'clean',
			decision
		]
			.filter(Boolean)
			.join(' · ')
	);

	function count(buckets: { name: string; count: number }[] | undefined, name: string): string {
		const b = buckets?.find((x) => x.name === name);
		// Optional facet: an un-upgraded API omits the bucket, so show no count
		// rather than a wrong one.
		return b ? b.count.toLocaleString() : '';
	}

	const decisionCounts = $derived<Record<string, string>>(
		stats
			? {
					undecided: stats.undecided.toLocaleString(),
					keep: stats.keep.toLocaleString(),
					hide: stats.hide.toLocaleString(),
					delete: stats.delete.toLocaleString()
				}
			: {}
	);
</script>

<FacetPanel
	glyph="⚙"
	{label}
	restLabel="State"
	ariaLabel="Filter by state"
	{open}
	onToggle={(v) => (open = v)}
	wide
>
	{#snippet children()}
		<p class="hd">visibility</p>
		<button class="row" role="menuitem" class:sel={!visibility} onclick={() => onChange({ visibility: undefined })}>
			<span>all</span>
		</button>
		{#each ['private', 'public'] as v (v)}
			<button class="row" role="menuitem" class:sel={visibility === v} onclick={() => onChange({ visibility: v })}>
				<span>{v}</span>
				<span class="c">{count(facets?.visibility, v)}</span>
			</button>
		{/each}

		<div class="divider"></div>
		<p class="hd">formatting</p>
		<button
			role="menuitem"
			class="row"
			class:sel={needs_formatting === undefined}
			onclick={() => onChange({ needs_formatting: undefined })}
		>
			<span>all</span>
		</button>
		<button
			role="menuitem"
			class="row"
			class:sel={needs_formatting === 1}
			onclick={() => onChange({ needs_formatting: 1 })}
		>
			<span>needs formatting</span>
			<span class="c">{count(facets?.needs_formatting, '1')}</span>
		</button>
		<button
			role="menuitem"
			class="row"
			class:sel={needs_formatting === 0}
			onclick={() => onChange({ needs_formatting: 0 })}
		>
			<span>clean</span>
			<span class="c">{count(facets?.needs_formatting, '0')}</span>
		</button>

		<div class="divider"></div>
		<p class="hd">decision</p>
		<button class="row" role="menuitem" class:sel={!decision} onclick={() => onChange({ decision: undefined })}>
			<span>all</span>
		</button>
		{#each ['undecided', 'keep', 'hide', 'delete'] as d (d)}
			<button
				class="row"
				role="menuitem"
				class:sel={decision === d}
				onclick={() => onChange({ decision: d as DecisionInput })}
			>
				<span>{d}</span>
				<span class="c">{decisionCounts[d] ?? ''}</span>
			</button>
		{/each}
	{/snippet}
</FacetPanel>

<style>
	.hd {
		font-size: 0.5rem; letter-spacing: 0.14em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.5;
		margin: 0; padding: 0.2rem 0.7rem 0.35rem;
	}
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
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.35rem 0; }
</style>

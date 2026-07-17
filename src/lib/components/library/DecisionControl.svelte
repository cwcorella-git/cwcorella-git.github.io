<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { DecisionInput, CurationStats } from '$lib/library/types';

	interface Props {
		stats: CurationStats | null;
		decision: DecisionInput | undefined;
		onChange: (patch: { decision?: DecisionInput }) => void;
	}

	const { stats, decision, onChange }: Props = $props();

	let open = $state(false);

	const DECISIONS: DecisionInput[] = ['undecided', 'keep', 'hide', 'delete'];

	// Counts come from /curation/stats, NOT the facets payload — curation lives in a
	// separate table and its stats never narrow by source. A null stats (best-effort
	// fetch) degrades to no counts rather than crashing.
	const counts = $derived<Record<string, string>>(
		stats
			? {
					undecided: stats.undecided.toLocaleString(),
					keep: stats.keep.toLocaleString(),
					hide: stats.hide.toLocaleString(),
					delete: stats.delete.toLocaleString()
				}
			: {}
	);

	function pick(v: DecisionInput | undefined) {
		// Explicit undefined clears the group when the parent spreads the patch.
		onChange({ decision: v });
		open = false;
	}
</script>

<FacetPanel
	glyph="◉"
	label={decision ?? ''}
	restLabel="Decision"
	ariaLabel="Filter by curation decision"
	{open}
	onToggle={(v) => (open = v)}
>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!decision} onclick={() => pick(undefined)}>
			<span>all</span>
		</button>
		<div class="divider"></div>
		{#each DECISIONS as d (d)}
			<button class="row" role="menuitem" class:sel={decision === d} onclick={() => pick(d)}>
				<span>{d}</span>
				<span class="c">{counts[d] ?? ''}</span>
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

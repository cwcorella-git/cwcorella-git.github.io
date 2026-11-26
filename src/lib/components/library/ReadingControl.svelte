<script lang="ts">
	import type { Facets, ReadingFilter } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		reading: ReadingFilter | undefined;
		onChange: (patch: { reading?: ReadingFilter }) => void;
	}

	const { facets, reading, onChange }: Props = $props();

	// Counts come from /facets (operator only). Absent on an un-upgraded API: the
	// buttons then show no number rather than a wrong one.
	const counts = $derived(facets?.reading);

	// Clicking the active one clears the filter (back to "all").
	function pick(v: ReadingFilter) {
		onChange({ reading: reading === v ? undefined : v });
	}
</script>

<div class="reading" role="group" aria-label="Reading list">
	<button class="seg" class:on={reading === 'to_read'} aria-pressed={reading === 'to_read'} onclick={() => pick('to_read')}>
		to read{#if counts} <span class="c">{counts.to_read.toLocaleString()}</span>{/if}
	</button>
	<button class="seg" class:on={reading === 'read'} aria-pressed={reading === 'read'} onclick={() => pick('read')}>
		read{#if counts} <span class="c">{counts.read.toLocaleString()}</span>{/if}
	</button>
</div>

<style>
	.reading { display: inline-flex; border: 1px solid rgba(var(--ui-rgb), 0.28); }
	.seg {
		background: none; border: none; cursor: pointer; color: var(--clr-meta);
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.06em;
		padding: 0.3rem 0.6rem; transition: color 0.12s;
	}
	.seg + .seg { border-left: 1px solid rgba(var(--ui-rgb), 0.28); }
	.seg:hover { color: var(--clr-text); }
	.seg.on { color: var(--clr-text); background: rgba(var(--ui-rgb), 0.18); }
	.c { font-variant-numeric: tabular-nums; opacity: 0.7; }
</style>

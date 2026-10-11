<script lang="ts">
	// VG preview (library rulings R3): show the list as VG's tiers see it, via
	// library-api's `tier` filter. /anchor-offset takes it too (library-api
	// 13d4346), so the jump rail keeps working under a preview.
	import FacetPanel from './FacetPanel.svelte';
	import type { TierFilter } from '$lib/library/types';

	interface Props {
		tier: TierFilter | undefined;
		onChange: (patch: { tier?: TierFilter }) => void;
	}

	const { tier, onChange }: Props = $props();

	let open = $state(false);

	const OPTIONS: { value: TierFilter; label: string; hint: string }[] = [
		{ value: 'public', label: 'VG public', hint: 'what anyone sees on VG' },
		{ value: 'curated', label: 'VG staff', hint: 'public + reference' },
		{ value: 'reference', label: 'reference only', hint: 'staff-only on VG' },
		{ value: 'none', label: 'not on VG', hint: 'never published' }
	];
	const current = $derived(OPTIONS.find((o) => o.value === tier)?.label ?? '');

	function pick(v: TierFilter | undefined) {
		onChange({ tier: v });
		open = false;
	}
</script>

<FacetPanel
	glyph="◇"
	label={current}
	restLabel="VG"
	ariaLabel="Preview the list as VG shows it"
	{open}
	onToggle={(v) => (open = v)}
>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!tier} onclick={() => pick(undefined)}>
			<span>all (no preview)</span>
		</button>
		<div class="divider"></div>
		{#each OPTIONS as o (o.value)}
			<button class="row" role="menuitem" class:sel={tier === o.value} onclick={() => pick(o.value)}>
				<span>{o.label}</span>
				<span class="c">{o.hint}</span>
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
	.c { color: var(--clr-meta); }
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.3rem 0; }
</style>

<script lang="ts">
	// The document's computed VG tier (R3). Absent tier (un-upgraded API) and
	// null (not on VG) both render nothing.
	import type { VgTier } from '$lib/library/types';
	let { tier }: { tier: VgTier | null | undefined } = $props();
</script>

{#if tier}
	<span class="tier tier-{tier}" title={tier === 'public' ? 'public on VG' : 'on VG for staff only'}>
		VG {tier === 'public' ? 'public' : 'staff'}
	</span>
{/if}

<style>
	.tier {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.05rem 0.35rem;
		border-radius: 2px;
		border: 1px solid rgba(var(--ui-rgb), 0.35);
		color: var(--clr-text);
		white-space: nowrap;
	}
	.tier-public {
		color: var(--pal-lib-link, var(--clr-text));
		border-color: color-mix(in srgb, var(--pal-lib-link, var(--clr-text)) 55%, transparent);
	}
</style>

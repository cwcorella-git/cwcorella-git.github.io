<script lang="ts">
	import type { RailAnchor } from '$lib/library/railLogic';

	interface Props {
		anchors: RailAnchor[];
		onSeek: (seek: string | null) => void;
	}

	const { anchors, onSeek }: Props = $props();
</script>

{#if anchors.length > 0}
	<nav class="rail" aria-label="jump to">
		{#each anchors as a (a.label)}
			<button class="rail-btn" onclick={() => onSeek(a.seek)} title={'jump to ' + a.label}>
				{a.label}
			</button>
		{/each}
	</nav>
{/if}

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		flex-shrink: 0;
		max-height: 70vh;
		overflow-y: auto;
		padding-left: 0.4rem;
	}
	.rail-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		line-height: 1.35;
		padding: 0 0.25rem;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.1s;
		text-align: center;
	}
	.rail-btn:hover {
		opacity: 1;
	}

	/* Below the mobile breakpoint the rail becomes a horizontal scroll strip so it
	   never forces the page body to scroll sideways. */
	@media (max-width: 480px) {
		.rail {
			flex-direction: row;
			max-height: none;
			overflow-x: auto;
			overflow-y: hidden;
			padding-left: 0;
			margin-bottom: 0.5rem;
		}
	}
</style>

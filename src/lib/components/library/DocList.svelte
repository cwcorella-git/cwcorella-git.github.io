<script lang="ts">
	import { VList, type VListHandle } from 'virtua/svelte';
	import DocRow from './DocRow.svelte';
	import DocCard from './DocCard.svelte';
	import JumpRail from './JumpRail.svelte';
	import type { DocListItem } from '$lib/library/types';
	import { anchorLabelForRow, type RailAnchor } from '$lib/library/railLogic';

	interface Props {
		total: number | null;
		rowAt: (index: number) => DocListItem | undefined;
		view: 'list' | 'grid';
		sort: string;
		queryKey: string;
		onOpen: (index: number) => void;
		onVisibleRange: (start: number, end: number) => void;
		resolveJumpIndex: (seek: string | null) => Promise<number>;
		anchors: RailAnchor[];
	}

	const {
		total,
		rowAt,
		view,
		sort,
		queryKey,
		onOpen,
		onVisibleRange,
		resolveJumpIndex,
		anchors
	}: Props = $props();

	let vlistRef: VListHandle | undefined = $state();
	let topIndex = $state<number | null>(null);

	// Index array of length `total`; VList renders only the visible slice.
	const slots = $derived(total ? Array.from({ length: total }, (_, i) => i) : []);

	// Live "you are here": the top visible row's own field decides its anchor
	// bucket. `rowAt` reads _version internally, so this re-runs when a window
	// lands; only overwrite when the row is loaded, so the label holds over gaps.
	let activeLabel = $state<string | null>(null);
	$effect(() => {
		if (topIndex === null) return;
		const row = rowAt(topIndex);
		if (row) activeLabel = anchorLabelForRow(sort, row);
	});

	function reportVisible(offset: number) {
		if (!vlistRef) return;
		const vp = vlistRef.getViewportSize();
		const start = vlistRef.findItemIndex(offset);
		const end = vlistRef.findItemIndex(offset + vp);
		topIndex = start;
		onVisibleRange(start, end);
	}

	function handleScroll(offset: number) {
		reportVisible(offset);
	}

	async function handleJump(seek: string | null) {
		const index = await resolveJumpIndex(seek);
		vlistRef?.scrollToIndex(index);
		onVisibleRange(index, index);
	}

	function handleScrubTo(index: number) {
		vlistRef?.scrollToIndex(index);
	}

	// New query = fresh list: scroll to top. (libraryState already reset the cache.)
	let prevQueryKey: string | undefined;
	$effect(() => {
		const previous = prevQueryKey;
		prevQueryKey = queryKey;
		if (previous !== undefined && queryKey !== previous) {
			vlistRef?.scrollTo(0);
		}
	});

	// Once total is known (or grows into view), ensure the visible window loads —
	// also covers a viewport taller than the first fetched window.
	$effect(() => {
		void total;
		if (!vlistRef || !total) return;
		reportVisible(vlistRef.getScrollOffset());
	});
</script>

<div class="doc-list-wrap">
	{#if total !== null}
		<p class="count">{total} documents</p>
	{/if}
	<div class="list-and-rail">
		<VList
			data={slots}
			getKey={(i) => i}
			bind:this={vlistRef}
			onscroll={handleScroll}
			style="height: 70vh; flex: 1; min-width: 0;"
		>
			{#snippet children(index)}
				{@const row = rowAt(index)}
				{#if row}
					{#if view === 'grid'}
						<div class="grid-cell"><DocCard item={row} onOpen={() => onOpen(index)} /></div>
					{:else}
						<DocRow item={row} onOpen={() => onOpen(index)} />
					{/if}
				{:else}
					<div class="skeleton" aria-hidden="true"></div>
				{/if}
			{/snippet}
		</VList>
		<JumpRail
			{anchors}
			onSeek={handleJump}
			{total}
			{activeLabel}
			onScrubTo={handleScrubTo}
		/>
	</div>
</div>

<style>
	.doc-list-wrap {
		display: flex;
		flex-direction: column;
	}
	.list-and-rail {
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
	}
	@media (max-width: 480px) {
		.list-and-rail {
			flex-direction: column-reverse;
		}
	}
	.count {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: var(--clr-text);
		opacity: 0.7;
		margin: 0 0 1rem;
	}
	.grid-cell {
		padding: 0.3rem 0;
	}
	.skeleton {
		height: 2.4rem;
		margin: 0.15rem 0;
		border-radius: 3px;
		background: var(--clr-text);
		opacity: 0.06;
	}
</style>

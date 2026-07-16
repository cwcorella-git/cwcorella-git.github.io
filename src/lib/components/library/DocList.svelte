<script lang="ts">
	import { VList, type VListHandle } from 'virtua/svelte';
	import DocRow from './DocRow.svelte';
	import DocCard from './DocCard.svelte';
	import JumpRail from './JumpRail.svelte';
	import type { DocListItem } from '$lib/library/types';
	import type { RailAnchor } from '$lib/library/railLogic';

	interface Props {
		items: DocListItem[];
		view: 'list' | 'grid';
		total: number | null;
		canLoadMore: boolean;
		isFetching: boolean;
		onLoadMore: () => void;
		queryKey: string;
		onOpen: (id: number | string) => void;
		anchors: RailAnchor[];
		onSeek: (seek: string | null) => void;
	}

	const {
		items,
		view,
		total,
		canLoadMore,
		isFetching,
		onLoadMore,
		queryKey,
		onOpen,
		anchors,
		onSeek
	}: Props = $props();

	// How close (in item-index terms) the last visible row must be to the end
	// of the currently-loaded items before we ask for the next page.
	const NEAR_END_INDEX_MARGIN = 10;

	let vlistRef: VListHandle | undefined = $state();

	// Re-entrancy latch: prevents a burst of scroll events (or repeated calls
	// while a fetch is in flight) from firing onLoadMore() more than once for
	// the same in-flight/next page. Cleared once the current fetch resolves
	// (isFetching flips back to false) or the query changes.
	let pendingRequest = $state(false);

	function maybeLoadMore(offset: number) {
		if (!vlistRef) return;
		if (!canLoadMore) return; // canLoadMore already encodes !isFetching
		if (pendingRequest) return; // already asked for this page; wait for it to resolve

		const viewportSize = vlistRef.getViewportSize();
		const lastVisibleIndex = vlistRef.findItemIndex(offset + viewportSize);

		if (items.length - lastVisibleIndex <= NEAR_END_INDEX_MARGIN) {
			pendingRequest = true;
			onLoadMore();
		}
	}

	function handleScroll(offset: number) {
		maybeLoadMore(offset);
	}

	// Re-check after every page append (also covers the case where a page of
	// results is shorter than the viewport, so no scroll event ever fires).
	$effect(() => {
		void items.length;
		if (!vlistRef) return;
		maybeLoadMore(vlistRef.getScrollOffset());
	});

	// A fetch just completed (success or failure) — re-arm the latch so the
	// next scroll (or the effect above) can request another page.
	let prevIsFetching: boolean | undefined;
	$effect(() => {
		const wasFetching = prevIsFetching;
		prevIsFetching = isFetching;
		if (wasFetching && !isFetching) {
			pendingRequest = false;
		}
	});

	// New query (search/sort/filter changed) = fresh list. Reset the latch and
	// scroll back to the top so stale scroll position doesn't false-trigger or
	// leave the user scrolled into what is now a different result set.
	let prevQueryKey: string | undefined;
	$effect(() => {
		const previous = prevQueryKey;
		prevQueryKey = queryKey;
		if (previous !== undefined && queryKey !== previous) {
			pendingRequest = false;
			vlistRef?.scrollTo(0);
		}
	});
</script>

<div class="doc-list-wrap">
	{#if total !== null}
		<p class="count">showing {items.length} of {total}</p>
	{/if}
	<div class="list-and-rail">
		<VList
			data={items}
			getKey={(item) => item.id}
			bind:this={vlistRef}
			onscroll={handleScroll}
			style="height: 70vh; flex: 1; min-width: 0;"
		>
			{#snippet children(item)}
				{#if view === 'grid'}
					<div class="grid-cell"><DocCard {item} {onOpen} /></div>
				{:else}
					<DocRow {item} {onOpen} />
				{/if}
			{/snippet}
		</VList>
		<JumpRail {anchors} {onSeek} />
	</div>
	{#if isFetching}
		<p class="status loading-more">loading more…</p>
	{/if}
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
	.status.loading-more {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: var(--clr-text);
		opacity: 0.6;
		text-align: center;
		margin: 0.75rem 0 0;
	}
</style>

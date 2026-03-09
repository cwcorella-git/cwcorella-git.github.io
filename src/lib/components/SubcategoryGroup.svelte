<script lang="ts">
	import type { LinkMeta } from '$lib/types';
	import LinkRow from './LinkRow.svelte';

	interface Subcategory {
		name: string;
		links: LinkMeta[];
	}

	interface Props {
		subcat: Subcategory;
		selectMode?: boolean;
		selected?: Set<string>;
		confirmingId?: string | null;
		deleteSaving?: boolean;
		isFiltering?: boolean;
		onSelect?: (id: string) => void;
		onEdit?: (link: LinkMeta) => void;
		onDelete?: (id: string) => void;
		onCancelDelete?: () => void;
		onConfirmDelete?: (id: string) => void;
		onTagClick?: (tag: string) => void;
	}

	const {
		subcat,
		selectMode = false,
		selected = new Set(),
		confirmingId = null,
		deleteSaving = false,
		isFiltering = false,
		onSelect = () => {},
		onEdit = () => {},
		onDelete = () => {},
		onCancelDelete = () => {},
		onConfirmDelete = () => {},
		onTagClick = () => {}
	}: Props = $props();

	let manuallyExpanded = $state(false);

	// Auto-expand during filtering, otherwise use manual state
	const isExpanded = $derived(isFiltering || manuallyExpanded);
</script>

<div class="subcategory-group">
	<button
		class="subcat-header"
		onclick={() => (manuallyExpanded = !manuallyExpanded)}
		aria-expanded={isExpanded}
	>
		<div class="subcat-row">
			<span class="subcat-title">{subcat.name}</span>
			<span class="subcat-count">({subcat.links.length})</span>
		</div>
	</button>

	{#if isExpanded}
		<ul class="links-list">
			{#each subcat.links as link (link.id)}
				<li>
					<LinkRow
						{link}
						{selectMode}
						isSelected={selected.has(link.id)}
						confirming={confirmingId === link.id}
						{onSelect}
						{onEdit}
						{onDelete}
						{onCancelDelete}
						{onConfirmDelete}
						{onTagClick}
						isDeleting={deleteSaving}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.subcategory-group {
		margin-bottom: 0;
		padding-left: 1.5rem;
	}

	.subcat-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.7rem 0;
		border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
		background: transparent;
		color: var(--clr-text);
		cursor: pointer;
		transition: opacity var(--t-ui);
		text-align: left;
	}

	.subcat-header:hover {
		opacity: 0.9;
	}

	.subcat-row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.subcat-title {
		font-family: var(--font-prose);
		font-size: 0.92rem;
		line-height: 1.4;
		color: var(--clr-text);
		letter-spacing: 0.02em;
		font-weight: normal;
	}

	.subcat-count {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.4;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.links-list li {
		list-style: none;
	}
</style>

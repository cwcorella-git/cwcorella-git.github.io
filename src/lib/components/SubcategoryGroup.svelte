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
		onSelect = () => {},
		onEdit = () => {},
		onDelete = () => {},
		onCancelDelete = () => {},
		onConfirmDelete = () => {},
		onTagClick = () => {}
	}: Props = $props();

	let isExpanded = $state(false);
</script>

<div class="subcategory-group">
	<button
		class="subcategory-header"
		onclick={() => (isExpanded = !isExpanded)}
		aria-expanded={isExpanded}
	>
		<span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
		<h3>{subcat.name} ({subcat.links.length})</h3>
	</button>

	{#if isExpanded}
		<div class="subcategory-content">
			<div class="links-list">
				{#each subcat.links as link (link.id)}
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
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.subcategory-group {
		margin-bottom: 0.75rem;
		border-left: 3px solid rgba(var(--ui-rgb), 0.15);
	}

	.subcategory-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.875rem 1rem;
		padding-left: 1.25rem;
		border: none;
		background: transparent;
		color: var(--clr-text);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 150ms;
		text-align: left;
	}

	.subcategory-header:hover {
		background: rgba(var(--ui-rgb), 0.05);
	}

	.expand-icon {
		display: inline-block;
		width: 1rem;
		text-align: center;
		font-size: 0.875rem;
		opacity: 0.6;
		transition: opacity 150ms;
	}

	.subcategory-header:hover .expand-icon {
		opacity: 0.9;
	}

	.subcategory-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.subcategory-content {
		padding: 0.5rem 0;
		padding-left: 1rem;
	}

	.links-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>

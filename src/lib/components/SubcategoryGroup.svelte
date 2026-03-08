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
		margin-bottom: 0;
		padding-left: 1.5rem;
		border-left: 1px solid rgba(var(--ui-rgb), 0.08);
	}

	.subcategory-header {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		width: 100%;
		padding: 0.4rem 0;
		border: none;
		background: transparent;
		color: var(--clr-text);
		font-size: 0.65rem;
		font-weight: normal;
		cursor: pointer;
		transition: none;
		text-align: left;
	}

	.expand-icon {
		display: inline-block;
		width: 0.6rem;
		text-align: center;
		font-size: 0.55rem;
		color: var(--clr-text);
		opacity: 0.3;
		transition: opacity var(--t-ui);
	}

	.subcategory-header:hover .expand-icon {
		opacity: 0.6;
	}

	.subcategory-header h3 {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: normal;
	}

	.subcategory-content {
		padding: 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
	}
</style>

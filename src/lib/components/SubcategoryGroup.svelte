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
		<span class="subcat-name">{subcat.name}</span>
		<span class="subcat-count">({subcat.links.length})</span>
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
		padding-right: 0.5rem;
		background: rgba(var(--ui-rgb), 0.04);
		border-radius: 3px;
	}

	.subcategory-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.45rem 0.5rem;
		border: none;
		background: transparent;
		color: var(--clr-text);
		cursor: pointer;
		transition: all var(--t-ui);
		text-align: left;
	}

	.subcategory-header:hover {
		opacity: 0.8;
	}

	.subcat-name {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: 500;
	}

	.subcat-count {
		font-family: var(--font-ui);
		font-size: 0.5rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		opacity: 0.4;
		flex-shrink: 0;
	}

	.subcategory-content {
		padding: 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
	}
</style>

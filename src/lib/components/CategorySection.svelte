<script lang="ts">
	import type { LinkMeta } from '$lib/types';
	import LinkRow from './LinkRow.svelte';

	interface Props {
		category: string;
		links: LinkMeta[];
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
		onCatRename?: (name: string) => void;
		onCatDelete?: (name: string) => void;
		onCatExport?: (name: string) => void;
	}

	const {
		category,
		links,
		selectMode = false,
		selected = new Set(),
		confirmingId = null,
		deleteSaving = false,
		onSelect = () => {},
		onEdit = () => {},
		onDelete = () => {},
		onCancelDelete = () => {},
		onConfirmDelete = () => {},
		onTagClick = () => {},
		onCatRename = () => {},
		onCatDelete = () => {},
		onCatExport = () => {}
	}: Props = $props();
</script>

<div class="category-section">
	<div class="cat-header">
		<div class="cat-info">
			<span class="cat-name">{category}</span>
			<span class="cat-count">{links.length}</span>
		</div>
		<div class="cat-actions">
			<button class="cat-btn" onclick={() => onCatRename(category)} title="Rename">rename</button>
			<button class="cat-btn danger" onclick={() => onCatDelete(category)} title="Delete">delete</button>
			<button class="cat-btn" onclick={() => onCatExport(category)} title="Export">export</button>
		</div>
	</div>

	<ul class="list">
		{#each links as link (link.id)}
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
</div>

<style>
	.category-section {
		margin-bottom: 2rem;
	}

	.cat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.75rem 0;
		margin-bottom: 0.5rem;
	}

	.cat-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.cat-name {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: normal;
	}

	.cat-count {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.45;
	}

	.cat-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.cat-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.5rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.4;
		padding: 0.1rem 0.25rem;
		transition: opacity var(--t-ui);
	}

	.cat-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.cat-btn:disabled {
		opacity: 0.2;
		cursor: not-allowed;
	}

	.cat-btn.danger {
		color: var(--clr-danger);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>

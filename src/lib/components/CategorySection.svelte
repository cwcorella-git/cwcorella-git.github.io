<script lang="ts">
	import type { LinkMeta } from '$lib/types';
	import SubcategoryGroup from './SubcategoryGroup.svelte';
	import LinkRow from './LinkRow.svelte';

	interface Subcategory {
		name: string;
		links: LinkMeta[];
	}

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

	let isExpanded = $state(false);

	// Group links by subcategory
	const subcategories = $derived(
		links.reduce<Subcategory[]>((acc, link) => {
			const subcat = link.subcategory || 'Other';
			const existing = acc.find(s => s.name === subcat);
			if (existing) {
				existing.links.push(link);
			} else {
				acc.push({ name: subcat, links: [link] });
			}
			return acc;
		}, []).sort((a, b) => b.links.length - a.links.length)
	);

	const hasSubcategories = $derived(
		subcategories.length > 1 || (subcategories.length === 1 && subcategories[0].name !== 'Other')
	);
</script>

<div class="category-section">
	<button
		class="category-header"
		class:expanded={isExpanded}
		onclick={() => (isExpanded = !isExpanded)}
		aria-expanded={isExpanded}
	>
		<span class="cat-name">{category}</span>
		<span class="cat-count">({links.length})</span>
	</button>
	<div class="cat-actions">
		<button class="cat-btn" onclick={() => onCatRename(category)} title="Rename">rename</button>
		<button class="cat-btn danger" onclick={() => onCatDelete(category)} title="Delete">delete</button>
		<button class="cat-btn" onclick={() => onCatExport(category)} title="Export">export</button>
	</div>

	{#if isExpanded}
		<div class="category-content">
			{#if hasSubcategories}
				{#each subcategories as subcat (subcat.name)}
					<SubcategoryGroup
						{subcat}
						{selectMode}
						{selected}
						{confirmingId}
						{deleteSaving}
						{onSelect}
						{onEdit}
						{onDelete}
						{onCancelDelete}
						{onConfirmDelete}
						{onTagClick}
					/>
				{/each}
			{:else}
				<!-- No subcategories, show links directly -->
				<div class="links-list">
					{#each links as link (link.id)}
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
			{/if}
		</div>
	{/if}
</div>

<style>
	.category-section {
		margin-bottom: 2rem;
		padding-left: 0.75rem;
		border-left: 3px solid transparent;
		transition: border-color var(--t-ui);
	}

	.category-section :global(.expanded) {
		border-left-color: rgba(var(--ui-rgb), 0.35);
	}

	.category-header {
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 0;
		margin-bottom: 0.5rem;
		flex: 1;
		color: var(--clr-text);
		text-align: left;
		transition: all var(--t-ui);
		font-weight: 600;
	}

	.category-header:hover {
		opacity: 0.85;
	}

	.cat-name {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: 600;
	}

	.cat-count {
		font-family: var(--font-ui);
		font-size: 0.56rem;
		letter-spacing: 0.05em;
		color: var(--clr-text);
		opacity: 0.45;
		flex-shrink: 0;
	}

	.cat-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
		margin-top: 0.25rem;
	}

	.cat-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.48rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.35;
		padding: 0.1rem 0.25rem;
		transition: opacity var(--t-ui);
	}

	.cat-btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.cat-btn:disabled {
		opacity: 0.15;
		cursor: not-allowed;
	}

	.cat-btn.danger {
		color: var(--clr-danger);
	}

	.category-content {
		padding: 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
	}
</style>

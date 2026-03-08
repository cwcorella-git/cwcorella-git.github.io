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
	<div class="category-header">
		<button
			class="expand-btn"
			onclick={() => (isExpanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			<span class="expand-icon">{isExpanded ? '∨' : '∧'}</span>
			<span class="cat-name">{category}</span>
			<span class="cat-count">({links.length})</span>
		</button>
		<div class="cat-actions">
			<button class="cat-btn" onclick={() => onCatRename(category)} title="Rename">rename</button>
			<button class="cat-btn danger" onclick={() => onCatDelete(category)} title="Delete">delete</button>
			<button class="cat-btn" onclick={() => onCatExport(category)} title="Export">export</button>
		</div>
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
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.75rem 0;
		margin-bottom: 0.5rem;
	}

	.expand-btn {
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0;
		flex: 1;
		min-width: 0;
		color: var(--clr-text);
		text-align: left;
		transition: none;
	}

	.expand-icon {
		display: inline-block;
		width: 0.6rem;
		text-align: center;
		font-size: 0.6rem;
		color: var(--clr-text);
		opacity: 0.4;
		transition: opacity var(--t-ui);
		flex-shrink: 0;
	}

	.expand-btn:hover .expand-icon {
		opacity: 0.7;
	}

	.cat-name {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: normal;
	}

	.cat-count {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.45;
		flex-shrink: 0;
	}

	.cat-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
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

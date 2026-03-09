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
			class="header-left"
			onclick={() => (isExpanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			<span class="cat-title">{category}</span>
			<span class="cat-count">({links.length})</span>
		</button>
		<div class="header-right">
			<button class="cat-action" onclick={() => onCatRename(category)}>edit</button>
			<button class="cat-action" onclick={() => onCatExport(category)}>export</button>
			<button class="cat-action" onclick={() => onCatDelete(category)}>×</button>
		</div>
	</div>

	{#if isExpanded}
		<div class="category-content">
			{#if hasSubcategories}
				<ul class="links-list">
					{#each subcategories as subcat (subcat.name)}
						<li class="subcat-item">
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
						</li>
					{/each}
				</ul>
			{:else}
				<ul class="links-list">
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
			{/if}
		</div>
	{/if}
</div>

<style>
	.category-section {
		margin-bottom: 0;
	}

	.category-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
	}

	.header-left {
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
		padding: 0.85rem 0;
		text-align: left;
		transition: color 0.15s;
	}

	.header-left:hover {
		color: var(--clr-text);
	}

	.cat-title {
		font-family: var(--font-prose);
		font-size: 1.1rem;
		line-height: 1.4;
		color: var(--clr-text);
		letter-spacing: 0.02em;
	}

	.cat-count {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.4;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		margin-left: auto;
	}

	.cat-action {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-text);
		padding: 0 0.3rem;
		transition: color 0.15s;
	}

	.cat-action:hover:not(:disabled) {
		color: var(--clr-text);
	}

	.cat-action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.category-content {
		padding-left: 1.5rem;
		padding-top: 0;
	}

	.links-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.links-list li {
		list-style: none;
	}

	.subcat-item {
		list-style: none;
	}
</style>

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
			<button class="cat-action" onclick={() => onCatRename(category)}>rename</button>
			<button class="cat-action danger" onclick={() => onCatDelete(category)}>delete</button>
			<button class="cat-action" onclick={() => onCatExport(category)}>export</button>
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
		margin-bottom: 1rem;
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		width: 100%;
		gap: 1.5rem;
	}

	.header-left {
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex: 1;
		min-width: 0;
		padding: 0;
		text-align: left;
		transition: opacity var(--t-ui);
	}

	.header-left:hover {
		opacity: 0.75;
	}

	.cat-title {
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.3;
		color: var(--clr-text);
		letter-spacing: 0.02em;
	}

	.cat-count {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--clr-text);
		opacity: 0.5;
		flex-shrink: 0;
		letter-spacing: 0.04em;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-shrink: 0;
	}

	.cat-action {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.56rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.45;
		padding: 0.05rem 0;
		transition: opacity var(--t-ui);
	}

	.cat-action:hover:not(:disabled) {
		opacity: 0.85;
	}

	.cat-action:disabled {
		opacity: 0.15;
		cursor: not-allowed;
	}

	.cat-action.danger {
		color: var(--clr-danger);
	}

	.category-content {
		padding-left: 1.5rem;
		padding-top: 0.5rem;
	}

	.links-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
</style>

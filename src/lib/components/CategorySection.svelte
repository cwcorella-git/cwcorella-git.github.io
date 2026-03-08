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
		onTagClick = () => {}
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
		onclick={() => (isExpanded = !isExpanded)}
		aria-expanded={isExpanded}
	>
		<span class="expand-icon">{isExpanded ? '∨' : '∧'}</span>
		<h2>{category} ({links.length})</h2>
	</button>

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
		margin-bottom: 0.25rem;
	}

	.category-header {
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0;
		flex: 1;
		min-width: 0;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.6rem 0;
		width: 100%;
		color: var(--clr-text);
		text-align: left;
		transition: none;
	}

	.expand-icon {
		display: inline-block;
		width: 1rem;
		text-align: center;
		font-size: 0.7rem;
		color: var(--clr-text);
		opacity: 0.4;
		transition: transform var(--t-ui);
	}

	.category-header h2 {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-text);
		font-weight: normal;
		flex: 1;
	}

	.category-content {
		padding: 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
	}
</style>

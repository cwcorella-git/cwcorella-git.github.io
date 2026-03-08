<script lang="ts">
	import type { LinkMeta } from '$lib/types';

	interface Props {
		link: LinkMeta;
		selectMode?: boolean;
		isSelected?: boolean;
		confirming?: boolean;
		onSelect?: (id: string) => void;
		onEdit?: (link: LinkMeta) => void;
		onDelete?: (id: string) => void;
		onCancelDelete?: () => void;
		onConfirmDelete?: (id: string) => void;
		onTagClick?: (tag: string) => void;
		isDeleting?: boolean;
	}

	const {
		link,
		selectMode = false,
		isSelected = false,
		confirming = false,
		onSelect = () => {},
		onEdit = () => {},
		onDelete = () => {},
		onCancelDelete = () => {},
		onConfirmDelete = () => {},
		onTagClick = () => {},
		isDeleting = false
	}: Props = $props();

	function domain(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}
</script>

<div class="entry-row" class:confirm-row={confirming}>
	{#if confirming}
		<span class="dim">delete "{link.title}"?</span>
		<div class="row-actions">
			<button class="action-btn danger" onclick={() => onConfirmDelete(link.id)} disabled={isDeleting}>
				{isDeleting ? '…' : 'confirm'}
			</button>
			<button class="action-btn" onclick={onCancelDelete}>cancel</button>
		</div>
	{:else}
		{#if selectMode}
			<input
				type="checkbox"
				class="select-check"
				checked={isSelected}
				onchange={() => onSelect(link.id)}
			/>
		{/if}
		<a class="entry-link" href={link.url} target="_blank" rel="noopener noreferrer">
			{#if link.source}<span class="source-indicator">{link.source}</span>{/if}
			<span class="entry-title">{link.title}</span>
			<span class="entry-domain">{domain(link.url)}</span>
		</a>
		{#if link.tags.length > 0}
			<span class="entry-tags">
				{#each link.tags.slice(0, 3) as tag}
					<button class="entry-tag" onclick={() => onTagClick(tag)}>{tag}</button>
				{/each}
				{#if link.tags.length > 3}
					<span class="entry-tag-overflow">+{link.tags.length - 3}</span>
				{/if}
			</span>
		{/if}
		<div class="row-actions">
			<button class="action-btn" onclick={() => onEdit(link)}>edit</button>
			<button class="action-btn danger" onclick={() => onDelete(link.id)}>×</button>
		</div>
	{/if}
</div>

<style>
	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		border-radius: 4px;
		transition: background 150ms;
	}

	.entry-row:hover {
		background: rgba(var(--ui-rgb), 0.05);
	}

	.entry-row.confirm-row {
		background: rgba(var(--clr-danger), 0.1);
		border-left: 3px solid var(--clr-danger);
	}

	.select-check {
		flex-shrink: 0;
		width: 1.1rem;
		height: 1.1rem;
		cursor: pointer;
	}

	.entry-link {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--clr-text);
		text-decoration: none;
		overflow: hidden;
	}

	.entry-link:hover {
		opacity: 0.8;
	}

	.source-indicator {
		font-size: 0.7rem;
		opacity: 0.5;
		flex-shrink: 0;
	}

	.entry-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entry-domain {
		flex-shrink: 0;
		opacity: 0.65;
		font-size: 0.75rem;
		color: var(--clr-text);
	}

	.entry-tags {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.entry-tag,
	.entry-tag-overflow {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		background: rgba(var(--ui-rgb), 0.12);
		color: var(--clr-text);
		border: none;
		cursor: pointer;
		transition: background 150ms;
	}

	.entry-tag:hover {
		background: rgba(var(--ui-rgb), 0.22);
	}

	.entry-tag-overflow {
		cursor: default;
	}

	.row-actions {
		display: flex;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.action-btn {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		padding: 0.25rem 0.6rem;
		border-radius: 3px;
		background: rgba(var(--ui-rgb), 0.12);
		color: var(--clr-text);
		border: none;
		cursor: pointer;
		transition: background 150ms;
	}

	.action-btn:hover:not(:disabled) {
		background: rgba(var(--ui-rgb), 0.22);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.danger {
		background: rgba(var(--clr-danger), 0.15);
		color: var(--clr-danger);
	}

	.action-btn.danger:hover:not(:disabled) {
		background: rgba(var(--clr-danger), 0.25);
	}

	.dim {
		font-size: 0.7rem;
		opacity: 0.65;
	}
</style>

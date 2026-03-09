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
		<button class="entry-title-btn" onclick={() => onEdit(link)}>
			{#if link.source}<span class="source-indicator">{link.source}</span>{/if}
			<span class="entry-title">{link.title}</span>
			<span class="entry-meta">{domain(link.url)}</span>
		</button>
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
			<button class="action-btn danger" onclick={() => onDelete(link.id)}>×</button>
		</div>
	{/if}
</div>

<style>
	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding-left: 2rem;
	}

	.entry-row.confirm-row {
		gap: 1.5rem;
		padding: 0.85rem 0;
	}

	.select-check {
		accent-color: var(--clr-text);
		width: 0.75rem;
		height: 0.75rem;
		flex-shrink: 0;
		cursor: pointer;
	}

	.entry-title-btn {
		flex: 1;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		padding: 0.4rem 0;
		transition: color 0.15s;
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.5rem;
	}

	.entry-title-btn:hover .entry-title {
		color: var(--clr-text);
	}

	.source-indicator {
		font-size: 0.55rem;
		opacity: 0.4;
		margin-right: 0.15rem;
		display: inline;
	}

	.entry-title {
		font-family: var(--font-prose);
		font-size: 0.75rem;
		color: var(--clr-text);
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.entry-meta {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.4;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.entry-tags {
		display: flex;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.entry-tag {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.15);
		font-family: var(--font-ui);
		font-size: 0.42rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		opacity: 0.4;
		padding: 0.05rem 0.25rem;
		cursor: pointer;
		transition: opacity var(--t-ui);
	}

	.entry-tag:hover {
		opacity: 0.8;
	}

	.entry-tag-overflow {
		font-family: var(--font-ui);
		font-size: 0.42rem;
		color: var(--clr-text);
		opacity: 0.3;
	}

	.row-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
		margin-left: auto;
	}

	.action-btn {
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

	.action-btn:hover:not(:disabled) {
		color: var(--clr-text);
	}

	.action-btn.danger {
		color: var(--clr-danger);
	}

	.action-btn.danger:hover:not(:disabled) {
		color: var(--clr-danger);
	}

	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.dim {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
	}
</style>

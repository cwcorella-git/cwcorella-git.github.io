<script lang="ts">
	import type { DocListItem } from '$lib/library/types';
	import { badgeLabel } from '$lib/library/curationLogic';

	interface Props {
		item: DocListItem;
		onOpen: () => void;
	}

	const { item, onOpen }: Props = $props();
</script>

<button class="doc-row" data-doc-id={item.id} onclick={() => onOpen()}>
	<span class="title">
		{#if item.visibility === 'public'}<span class="mine" aria-label="mine (public)" title="public">◉</span>{/if}
		{item.title}
	</span>
	<span class="meta">
		{#if item.decision}
			<span class="decision decision-{item.decision}">{badgeLabel(item.decision)}</span>
		{/if}
		<span class="author">{item.author ?? '—'}</span>
		<span class="source">{item.source}</span>
		<span class="date">{item.publication_date ?? '—'}</span>
		<span class="words">{item.word_count.toLocaleString()}w</span>
		{#if item.tags.length > 0}
			{#each item.tags.slice(0, 3) as tag (tag)}<span class="chip">{tag}</span>{/each}
			{#if item.tags.length > 3}<span class="chip-more">+{item.tags.length - 3}</span>{/if}
		{/if}
		{#if item.needs_formatting}
			<span class="badge">needs formatting</span>
		{/if}
	</span>
</button>

<style>
	.doc-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.12);
		padding: 0.5rem 0;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font-family: var(--font-ui);
	}

	.doc-row:hover .title {
		color: var(--clr-text);
	}

	.title {
		font-family: var(--font-prose);
		font-size: 0.78rem;
		color: var(--clr-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1 1 auto;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		color: var(--clr-text);
		opacity: 0.55;
		white-space: nowrap;
	}

	.badge {
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-size: 0.5rem;
		opacity: 0.85;
	}

	.mine { color: var(--clr-text); opacity: 0.85; margin-right: 0.2rem; font-size: 0.65rem; }
	.chip {
		font-size: 0.48rem; letter-spacing: 0.04em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.03rem 0.25rem; color: var(--clr-text); opacity: 0.7;
	}
	.chip-more { font-size: 0.48rem; opacity: 0.5; }

	.decision {
		border: 1px solid transparent;
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-size: 0.5rem;
		letter-spacing: 0.06em;
	}
	.decision-keep { color: var(--clr-text); border-color: rgba(var(--ui-rgb), 0.5); opacity: 1; }
	.decision-hide { opacity: 0.5; border-color: rgba(var(--ui-rgb), 0.25); }
	.decision-delete { color: var(--clr-danger); border-color: var(--clr-danger); }
</style>

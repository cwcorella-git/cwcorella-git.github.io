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
	<span class="title">{item.title}</span>
	<span class="meta">
		{#if item.decision}
			<span class="decision decision-{item.decision}">{badgeLabel(item.decision)}</span>
		{/if}
		<span class="author">{item.author ?? '—'}</span>
		<span class="source">{item.source}</span>
		<span class="date">{item.publication_date ?? '—'}</span>
		<span class="words">{item.word_count.toLocaleString()}w</span>
		{#if item.needs_formatting}
			<span class="badge">needs formatting</span>
		{/if}
		<span class="updated">{item.updated_at}</span>
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

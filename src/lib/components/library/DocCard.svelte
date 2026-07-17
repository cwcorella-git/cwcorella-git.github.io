<script lang="ts">
	import type { DocListItem } from '$lib/library/types';
	import { badgeLabel } from '$lib/library/curationLogic';

	interface Props {
		item: DocListItem;
		onOpen: () => void;
	}

	const { item, onOpen }: Props = $props();
</script>

<button class="doc-card" data-doc-id={item.id} onclick={() => onOpen()}>
	<span class="title">
		{#if item.visibility === 'public'}<span class="mine" aria-label="mine (public)" title="public">◉</span>{/if}
		{item.title}
	</span>
	<span class="author">{item.author ?? '—'}</span>
	<span class="row">
		<span class="source">{item.source}</span>
		<span class="date">{item.publication_date ?? '—'}</span>
		{#if item.decision}
			<span class="decision decision-{item.decision}">{badgeLabel(item.decision)}</span>
		{/if}
	</span>
	<span class="row">
		<span class="words">{item.word_count.toLocaleString()}w</span>
		{#if item.needs_formatting}
			<span class="badge">needs formatting</span>
		{/if}
	</span>
	{#if item.tags.length > 0}
		<span class="chips">
			{#each item.tags.slice(0, 6) as tag (tag)}<span class="chip">{tag}</span>{/each}
			{#if item.tags.length > 6}<span class="chip-more">+{item.tags.length - 6}</span>{/if}
		</span>
	{/if}
</button>

<style>
	.doc-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
		height: 100%;
		background: rgba(var(--ui-rgb), 0.03);
		border: 1px solid rgba(var(--ui-rgb), 0.12);
		padding: 0.7rem;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font-family: var(--font-ui);
		transition: border-color 0.15s;
	}

	.doc-card:hover {
		border-color: rgba(var(--ui-rgb), 0.32);
	}

	.doc-card:hover .title {
		color: var(--clr-text);
	}

	.title {
		font-family: var(--font-prose);
		font-size: 0.78rem;
		color: var(--clr-text);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.author {
		font-size: 0.6rem;
		color: var(--clr-text);
		opacity: 0.6;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		color: var(--clr-text);
		opacity: 0.55;
	}

	.badge {
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-size: 0.48rem;
		opacity: 0.85;
	}

	.mine { color: var(--clr-text); opacity: 0.85; margin-right: 0.3rem; font-size: 0.7rem; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.15rem; }
	.chip {
		font-size: 0.5rem; letter-spacing: 0.04em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.05rem 0.3rem; color: var(--clr-text); opacity: 0.7;
	}
	.chip-more { font-size: 0.5rem; opacity: 0.5; align-self: center; }

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

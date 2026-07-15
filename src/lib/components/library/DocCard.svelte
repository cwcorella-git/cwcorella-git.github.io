<script lang="ts">
	import type { DocListItem } from '$lib/library/types';

	interface Props {
		item: DocListItem;
		onOpen: (id: number | string) => void;
	}

	const { item, onOpen }: Props = $props();
</script>

<button class="doc-card" data-doc-id={item.id} onclick={() => onOpen(item.id)}>
	<span class="title">{item.title}</span>
	<span class="author">{item.author ?? '—'}</span>
	<span class="row">
		<span class="source">{item.source}</span>
		<span class="date">{item.publication_date ?? '—'}</span>
	</span>
	<span class="row">
		<span class="words">{item.word_count.toLocaleString()}w</span>
		{#if item.needs_formatting}
			<span class="badge">needs formatting</span>
		{/if}
	</span>
	<span class="updated">updated {item.updated_at}</span>
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

	.updated {
		margin-top: auto;
		font-size: 0.5rem;
		color: var(--clr-text);
		opacity: 0.4;
	}
</style>

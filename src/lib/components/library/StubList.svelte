<script lang="ts">
	import ReadingButtons from './ReadingButtons.svelte';
	import type { ReadingItem } from '$lib/library/types';
	import type { ReadingAction } from '$lib/library/readingLogic';

	interface Props {
		items: ReadingItem[];
		onAct: (itemId: number, a: ReadingAction) => void;
	}
	const { items, onAct }: Props = $props();

	// A stub is a book we hold links for but no text. Its links are the point:
	// they are shown in stored order, and only http(s) is ever linked (the API
	// refuses anything else, and this checks again before rendering an href).
	const safe = (u: string) => /^https?:\/\//i.test(u);
</script>

{#if items.length > 0}
	<section class="stubs" aria-label="Reading list entries without text">
		<h3>no text in the library <span class="n">{items.length.toLocaleString()}</span></h3>
		<ul>
			{#each items as it (it.item_id)}
				<li class="stub">
					<span class="t">
						<span class="title">{it.title ?? '(untitled)'}</span>
						<span class="meta">{[it.author, it.year_hint, it.category].filter(Boolean).join(' · ')}</span>
					</span>
					<span class="links">
						{#each it.links as l (l.url)}
							{#if safe(l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a>{/if}
						{/each}
					</span>
					<ReadingButtons
						state={{ item_id: it.item_id, to_read: Boolean(it.to_read), read: it.read, links: it.links }}
						onAct={(a) => onAct(it.item_id, a)}
					/>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.stubs { margin: 0 0 0.8rem; border: 1px solid rgba(var(--ui-rgb), 0.16); }
	h3 {
		margin: 0; padding: 0.4rem 0.7rem; font-family: var(--font-ui); font-size: 0.55rem;
		letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-text); opacity: 0.7;
	}
	.n { font-variant-numeric: tabular-nums; }
	ul { list-style: none; margin: 0; padding: 0; max-height: 38vh; overflow-y: auto; }
	.stub {
		display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0.3rem 0.8rem;
		padding: 0.4rem 0.7rem; border-top: 1px solid rgba(var(--ui-rgb), 0.12);
		box-shadow: inset 3px 0 0 var(--clr-text);
	}
	.t { display: flex; flex-direction: column; min-width: 0; flex: 1 1 14rem; }
	.title { font-family: var(--font-prose); font-size: 0.78rem; color: var(--clr-text); }
	.meta { font-family: var(--font-ui); font-size: 0.55rem; color: var(--clr-text); opacity: 0.6; }
	.links { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; font-family: var(--font-ui); font-size: 0.55rem; }
	.links a { color: var(--clr-text); opacity: 0.75; }
</style>

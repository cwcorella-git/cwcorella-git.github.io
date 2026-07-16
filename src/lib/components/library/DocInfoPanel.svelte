<script lang="ts">
	import type { TocEntry } from '$lib/admin/markdown';
	import type { LibraryDoc } from '$lib/library/types';
	import { tocNumber, condenseMeta, activeLabel } from '$lib/library/tocLogic';

	interface Props {
		toc: TocEntry[];
		activeAnchor: string | null;
		doc: LibraryDoc;
		onJump: (anchor: string) => void;
	}

	const { toc, activeAnchor, doc, onJump }: Props = $props();

	let expanded = $state(false);

	const numbers = $derived(tocNumber(toc));
	const barLabel = $derived(
		activeLabel(toc, numbers, activeAnchor) ?? condenseMeta(doc) ?? ''
	);
	const minLevel = $derived(toc.length ? Math.min(...toc.map((t) => t.level)) : 1);

	function jump(anchor: string) {
		onJump(anchor);
		expanded = false;
	}

	function toggle() {
		expanded = !expanded;
	}

	function onBarKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') expanded = false;
	}
</script>

{#snippet infoRows()}
	<dl class="meta-grid">
		<dt>author</dt><dd>{doc.author ?? '—'}</dd>
		<dt>source</dt><dd>{doc.source}</dd>
		<dt>published</dt><dd>{doc.publication_date ?? '—'}</dd>
		<dt>language</dt><dd>{doc.language}</dd>
		<dt>type</dt><dd>{doc.document_type}</dd>
		<dt>words / chars</dt><dd>{doc.word_count.toLocaleString()} / {doc.char_count.toLocaleString()}</dd>
		<dt>visibility</dt><dd>{doc.visibility}</dd>
		<dt>updated</dt><dd>{doc.updated_at}</dd>
	</dl>

	{#if doc.needs_formatting}
		<span class="badge">needs formatting</span>
	{/if}

	{#if doc.tags.length > 0}
		<div class="chip-row">
			{#each doc.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
		</div>
	{/if}

	{#if doc.collections.length > 0}
		<div class="chip-row">
			{#each doc.collections as collection (collection)}<span class="chip chip-collection">{collection}</span>{/each}
		</div>
	{/if}
{/snippet}

{#snippet tocList()}
	{#if toc.length > 0}
		<ul class="toc">
			{#each toc as entry, i (entry.anchor + '-' + i)}
				<li style="padding-left: {(entry.level - minLevel) * 0.75}rem">
					<button
						class="toc-item"
						class:active={entry.anchor === activeAnchor}
						aria-current={entry.anchor === activeAnchor ? 'true' : undefined}
						onclick={() => jump(entry.anchor)}
					>
						<span class="num">{numbers[i]}.</span>
						<span class="txt">{entry.text}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<!-- Desktop sidebar (>= 900px) -->
<aside class="sidebar" aria-label="Document info and contents">
	{#if toc.length > 0}
		<h3 class="panel-title">On this page</h3>
		{@render tocList()}
		<hr class="divider" />
	{/if}
	<h3 class="panel-title">Document info</h3>
	{@render infoRows()}
</aside>

<!-- Narrow slim bar (< 900px) -->
<div class="slim" onkeydown={onBarKeydown}>
	<button class="slim-bar" onclick={toggle} aria-expanded={expanded}>
		<span class="caret">{expanded ? '▾' : '▸'}</span>
		<span class="slim-label">{expanded ? 'On this page' : barLabel}</span>
		<span class="info-glyph" aria-hidden="true">ⓘ</span>
	</button>
	{#if expanded}
		<div class="slim-panel">
			{@render tocList()}
			{#if toc.length > 0}<hr class="divider" />{/if}
			{@render infoRows()}
		</div>
	{/if}
</div>

<style>
	.sidebar {
		display: none;
		font-family: var(--font-ui);
	}
	@media (min-width: 900px) {
		.sidebar { display: block; }
		.slim { display: none; }
	}

	.panel-title {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.55;
		color: var(--clr-text);
		margin: 0 0 0.6rem;
	}

	.toc { list-style: none; margin: 0 0 0.4rem; padding: 0; }
	.toc-item {
		display: flex;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-left: 2px solid transparent;
		padding: 0.15rem 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		line-height: 1.5;
		color: var(--clr-text);
		opacity: 0.6;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.toc-item:hover { opacity: 0.9; }
	.toc-item.active {
		opacity: 1;
		border-left-color: var(--clr-text);
	}
	.toc-item.active::before { content: '▸'; margin-right: 0.15rem; }
	.toc-item .num { opacity: 0.5; }
	.toc-item .txt { min-width: 0; }

	.divider {
		border: none;
		border-top: 1px solid rgba(var(--ui-rgb), 0.15);
		margin: 0.9rem 0;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 0.8rem;
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		margin: 0 0 0.8rem;
	}
	.meta-grid dt { opacity: 0.5; text-transform: uppercase; }
	.meta-grid dd { margin: 0; opacity: 0.85; overflow-wrap: anywhere; }

	.badge {
		display: inline-block;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-family: var(--font-ui);
		font-size: 0.5rem;
		opacity: 0.85;
		margin-bottom: 0.6rem;
	}
	.chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.6rem; }
	.chip {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.04em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.12rem 0.4rem;
		color: var(--clr-text);
		opacity: 0.75;
	}
	.chip-collection { opacity: 0.9; }

	/* Slim bar */
	.slim {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.18);
	}
	.slim-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0.5rem 0.9rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		cursor: pointer;
	}
	.slim-bar .caret { opacity: 0.7; }
	.slim-label { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
	.info-glyph { opacity: 0.55; }
	.slim-panel {
		padding: 0.3rem 0.9rem 0.9rem;
		max-height: 55vh;
		overflow-y: auto;
	}
</style>

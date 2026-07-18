<script lang="ts">
	import type { TocEntry } from '$lib/admin/markdown';
	import type { LibraryDoc, DocVersion } from '$lib/library/types';
	import { tocNumber, pillLabel } from '$lib/library/tocLogic';
	import VersionsPanel from './VersionsPanel.svelte';

	interface Props {
		toc: TocEntry[];
		activeAnchor: string | null;
		doc: LibraryDoc;
		onJump: (anchor: string) => void;
		versions?: DocVersion[];
		onRestore?: (id: number) => void;
		onRestoreOriginal?: () => void;
	}

	const { toc, activeAnchor, doc, onJump, versions, onRestore, onRestoreOriginal }: Props = $props();

	let expanded = $state(false);
	let activeTab = $state<'toc' | 'info' | 'versions'>('toc');
	let desktopTab = $state<'info' | 'versions'>('info');

	const showVersions = $derived(!!doc.edited || !!(versions && versions.length > 0));
	const noop = () => {};

	const numbers = $derived(tocNumber(toc));
	const pill = $derived(pillLabel(toc, numbers, activeAnchor));
	const minLevel = $derived(toc.length ? Math.min(...toc.map((t) => t.level)) : 1);

	function jump(anchor: string) {
		onJump(anchor);
		expanded = false;
	}

	function toggle() {
		expanded = !expanded;
		if (expanded && toc.length === 0) activeTab = 'info';
	}

	function close() {
		expanded = false;
	}

	// Escape closes the sheet before DocReader's global Escape closes the reader.
	// Capture phase runs before DocReader's bubble-phase svelte:window handler.
	$effect(() => {
		if (!expanded) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				close();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
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
	{#if showVersions}
		<div class="tabs sidebar-tabs" role="tablist" aria-label="Info panel">
			<button
				type="button"
				role="tab"
				class="tab"
				class:selected={desktopTab === 'info'}
				aria-selected={desktopTab === 'info'}
				onclick={() => (desktopTab = 'info')}
			>Info</button>
			<button
				type="button"
				role="tab"
				class="tab"
				class:selected={desktopTab === 'versions'}
				aria-selected={desktopTab === 'versions'}
				onclick={() => (desktopTab = 'versions')}
			>Versions</button>
		</div>
		{#if desktopTab === 'versions'}
			<VersionsPanel
				versions={versions ?? []}
				onRestore={onRestore ?? noop}
				onRestoreOriginal={onRestoreOriginal ?? noop}
				edited={!!doc.edited}
			/>
		{:else}
			<h3 class="panel-title">Document info</h3>
			{@render infoRows()}
		{/if}
	{:else}
		<h3 class="panel-title">Document info</h3>
		{@render infoRows()}
	{/if}
</aside>

<!-- Narrow floating pill + tabbed sheet (< 900px) -->
<div class="narrow">
	{#if expanded}
		<button
			type="button"
			class="sheet-scrim"
			aria-label="Close"
			onclick={close}
		></button>
		<div class="sheet" role="dialog" aria-modal="false" aria-label="Contents and document info">
			{#if toc.length > 0 || showVersions}
				<div class="tabs" role="tablist" aria-label="Panel">
					{#if toc.length > 0}
						<button
							type="button"
							role="tab"
							class="tab"
							class:selected={activeTab === 'toc'}
							aria-selected={activeTab === 'toc'}
							onclick={() => (activeTab = 'toc')}
						>On this page</button>
					{/if}
					<button
						type="button"
						role="tab"
						class="tab"
						class:selected={activeTab === 'info'}
						aria-selected={activeTab === 'info'}
						onclick={() => (activeTab = 'info')}
					>Info</button>
					{#if showVersions}
						<button
							type="button"
							role="tab"
							class="tab"
							class:selected={activeTab === 'versions'}
							aria-selected={activeTab === 'versions'}
							onclick={() => (activeTab = 'versions')}
						>Versions</button>
					{/if}
				</div>
				<div class="sheet-body" role="tabpanel">
					{#if activeTab === 'toc'}
						{@render tocList()}
					{:else if activeTab === 'versions'}
						<VersionsPanel
							versions={versions ?? []}
							onRestore={onRestore ?? noop}
							onRestoreOriginal={onRestoreOriginal ?? noop}
							edited={!!doc.edited}
						/>
					{:else}
						{@render infoRows()}
					{/if}
				</div>
			{:else}
				<div class="sheet-body">
					{@render infoRows()}
				</div>
			{/if}
		</div>
	{/if}
	<button class="pill" onclick={toggle} aria-expanded={expanded} aria-label="Table of contents and document info">
		<span class="pill-glyph" aria-hidden="true">{pill.glyph}</span>
		<span class="pill-text">{pill.text}</span>
	</button>
</div>

<style>
	.sidebar {
		display: none;
		font-family: var(--font-ui);
	}
	@media (min-width: 900px) {
		.sidebar { display: block; }
		.narrow { display: none; }
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

	/* Narrow floating pill + tabbed sheet */
	.narrow { display: contents; }
	@media (min-width: 900px) {
		.narrow { display: none; }
	}

	.pill {
		position: fixed;
		bottom: 1.25rem;
		right: 1.25rem;
		z-index: 310;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: min(70vw, 320px);
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		border-radius: 999px;
		padding: 0.5rem 0.9rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		cursor: pointer;
	}
	.pill-glyph { opacity: 0.6; }
	.pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.9; }

	.sheet-scrim {
		position: fixed;
		inset: 0;
		z-index: 309;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
	}

	.sheet {
		position: fixed;
		right: 1.25rem;
		bottom: 4rem;
		z-index: 311;
		width: min(86vw, 320px);
		max-height: 60vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		border-radius: 0.5rem;
	}
	.tabs {
		display: flex;
		flex-shrink: 0;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.18);
	}
	.tab {
		flex: 1;
		background: none;
		border: none;
		padding: 0.55rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.5;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.tab.selected { opacity: 1; box-shadow: inset 0 -2px 0 var(--clr-text); }
	.sheet-body {
		padding: 0.7rem 0.9rem 0.9rem;
		overflow-y: auto;
	}

	.sidebar-tabs {
		margin-bottom: 0.6rem;
		border: 1px solid rgba(var(--ui-rgb), 0.18);
	}
</style>

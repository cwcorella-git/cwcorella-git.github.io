<script lang="ts">
	import type { Book } from '$lib/types';
	import type { TocEntry } from '$lib/admin/markdown';
	import type { EncryptedDoc } from '$lib/admin/crypto';
	import { adminState } from '$lib/admin/state.svelte';
	import { decryptDoc } from '$lib/admin/crypto';
	import { renderMarkdown, extractToc } from '$lib/admin/markdown';
	import { toast } from '$lib/admin/toast.svelte';

	let { book, onClose }: { book: Book; onClose: () => void } = $props();

	type State = 'loading' | 'content' | 'unavailable' | 'error';

	let viewState = $state<State>('loading');
	let html = $state('');
	let toc = $state<TocEntry[]>([]);
	let errorMsg = $state('');

	async function load() {
		if (!book.doc) { viewState = 'unavailable'; return; }
		if (book.doc.visibility === 'admin' && !adminState.active) { viewState = 'unavailable'; return; }

		viewState = 'loading';
		try {
			if (book.doc.visibility === 'public') {
				const res = await fetch(`/docs/public/${book.doc.file}.md`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const md = await res.text();
				toc = extractToc(md);
				html = renderMarkdown(md);
			} else {
				const res = await fetch(`/docs/private/${book.doc.file}.enc`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const enc: EncryptedDoc = await res.json();
				let md: string;
				try {
					md = await decryptDoc(enc, adminState.contentKey);
				} catch {
					toast.error('Incorrect content key.');
					viewState = 'error';
					errorMsg = 'Incorrect content key.';
					return;
				}
				toc = extractToc(md);
				html = renderMarkdown(md);
			}
			viewState = 'content';
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to load document.';
			toast.error(errorMsg);
			viewState = 'error';
		}
	}

	// Load on mount
	$effect(() => { load(); });

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	let contentEl = $state<HTMLElement>();

	function scrollTo(anchor: string) {
		const el = (contentEl as HTMLElement)?.querySelector(`#${anchor}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" role="dialog" aria-modal="true" aria-label={book.title}>
	<div class="overlay-header">
		<div class="book-info">
			<span class="book-title">{book.title}</span>
			<span class="book-meta">{book.author}{book.year ? ` · ${book.year}` : ''}</span>
		</div>
		<button class="close-btn" onclick={onClose} aria-label="Close">×</button>
	</div>

	<div class="overlay-body">
		{#if viewState === 'loading'}
			<div class="state-center">
				<span class="spinner" aria-label="Loading"></span>
			</div>

		{:else if viewState === 'unavailable'}
			<div class="state-center">
				<p class="state-msg">no source available</p>
			</div>

		{:else if viewState === 'error'}
			<div class="state-center">
				<p class="state-msg error">{errorMsg}</p>
			</div>

		{:else}
			{#if toc.length > 0}
				<aside class="toc">
					<p class="toc-label">contents</p>
					<nav aria-label="Table of contents">
						{#each toc as entry}
							<button
								class="toc-item"
								class:toc-h1={entry.level === 1}
								class:toc-h2={entry.level === 2}
								class:toc-h3={entry.level === 3}
								onclick={() => scrollTo(entry.anchor)}
							>
								{entry.text}
							</button>
						{/each}
					</nav>
				</aside>
			{/if}
			<div class="doc-content" bind:this={contentEl}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex;
		flex-direction: column;
	}

	.overlay-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		border-bottom: 1px solid rgba(100, 75, 40, 0.12);
		flex-shrink: 0;
	}

	.book-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.book-title {
		font-size: 0.95rem;
		color: #3d2e1a;
	}

	.book-meta {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: #8a6a40;
	}

	.close-btn {
		background: none;
		border: none;
		color: #b09070;
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}
	.close-btn:hover { color: #7a5020; }

	.overlay-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.state-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.state-msg {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: #8a6a40;
	}
	.state-msg.error { color: #c07050; }

	.spinner {
		display: inline-block;
		width: 20px;
		height: 20px;
		border: 2px solid rgba(100, 75, 40, 0.15);
		border-top-color: #8a6a40;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.toc {
		width: 220px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: 1.5rem 1rem;
		border-right: 1px solid rgba(100, 75, 40, 0.1);
	}

	.toc-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #9a7a50;
		margin: 0 0 0.8rem;
	}

	.toc-item {
		display: block;
		width: 100%;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		line-height: 1.5;
		color: #8a6a40;
		padding: 0.2rem 0;
		transition: color 0.15s;
	}
	.toc-item:hover { color: #7a5020; }
	.toc-h1 { font-weight: bold; }
	.toc-h2 { padding-left: 0.8rem; }
	.toc-h3 { padding-left: 1.6rem; font-size: 0.58rem; }

	.doc-content {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
	}

	:global(.doc-content h1),
	:global(.doc-content h2),
	:global(.doc-content h3) {
		font-family: var(--font-prose);
		color: #3d2e1a;
		font-weight: normal;
		margin-top: 2rem;
	}
	:global(.doc-content h1) { font-size: 1.4rem; border-bottom: 1px solid rgba(100,75,40,0.15); padding-bottom: 0.5rem; }
	:global(.doc-content h2) { font-size: 1.1rem; }
	:global(.doc-content h3) { font-size: 0.95rem; color: #5a4020; }
	:global(.doc-content p) { line-height: 1.9; color: #4a3820; margin-bottom: 1rem; }
	:global(.doc-content a) { color: #7a5020; }
	:global(.doc-content blockquote) {
		border-left: 2px solid rgba(100,75,40,0.25);
		margin: 1rem 0;
		padding: 0.3rem 1rem;
		color: #8a6a40;
		font-style: italic;
	}
	:global(.doc-content code) {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.82em;
		background: rgba(100,75,40,0.07);
		padding: 0.1em 0.35em;
		color: #7a5020;
	}
	:global(.doc-content pre) {
		background: rgba(100,75,40,0.04);
		border: 1px solid rgba(100,75,40,0.12);
		padding: 1rem;
		overflow-x: auto;
	}
	:global(.doc-content ul, .doc-content ol) { line-height: 1.8; color: #4a3820; padding-left: 1.5rem; }

	@media (max-width: 640px) {
		.toc { display: none; }
	}
</style>

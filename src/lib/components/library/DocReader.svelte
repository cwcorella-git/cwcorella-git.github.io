<script lang="ts">
	import { renderMarkdown, extractToc } from '$lib/admin/markdown';
	import { libraryState } from '$lib/library/libraryState.svelte';
	import type { Decision } from '$lib/library/types';
	import DocInfoPanel from './DocInfoPanel.svelte';

	const DECISIONS: Decision[] = ['keep', 'hide', 'delete'];
	function decide(d: Decision) { libraryState.setDecision(d); }

	function close() {
		libraryState.closeDoc();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function handleBackdropClick() {
		close();
	}

	const bodyHtml = $derived(
		libraryState.openDoc?.body ? renderMarkdown(libraryState.openDoc.body) : ''
	);

	const toc = $derived(libraryState.openDoc?.body ? extractToc(libraryState.openDoc.body) : []);

	let activeAnchor = $state<string | null>(null);
	let bodyEl: HTMLElement | undefined = $state();
	let scrollEl: HTMLElement | undefined = $state();

	// Active-section highlight: observe rendered heading anchors within the
	// scroll container; pick the topmost intersecting one. Rebuilds when the
	// body HTML or TOC changes (i.e. a new document opens).
	$effect(() => {
		void bodyHtml; // rebuild when body changes
		const body = bodyEl;
		const root = scrollEl;
		activeAnchor = null;
		if (!body || !root || toc.length === 0) return;

		const anchors: HTMLElement[] = [];
		for (const entry of toc) {
			const el = body.querySelector<HTMLElement>(`#${CSS.escape(entry.anchor)}`);
			if (el) anchors.push(el);
		}
		if (anchors.length === 0) return;

		const visible = new Map<string, boolean>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const id = (entry.target as HTMLElement).id;
					if (!id) continue;
					if (entry.isIntersecting) visible.set(id, true);
					else visible.delete(id);
				}
				if (visible.size === 0) return;
				let bestId: string | null = null;
				let bestTop = Number.POSITIVE_INFINITY;
				for (const id of visible.keys()) {
					const el = anchors.find((a) => a.id === id);
					if (!el) continue;
					const top = el.getBoundingClientRect().top;
					if (top < bestTop) { bestTop = top; bestId = id; }
				}
				if (bestId) activeAnchor = bestId;
			},
			{ root, rootMargin: '0px 0px -65% 0px', threshold: [0, 1] }
		);
		anchors.forEach((a) => observer.observe(a));
		return () => observer.disconnect();
	});

	function handleJump(anchor: string) {
		const body = bodyEl;
		const root = scrollEl;
		if (!body || !root) return;
		const el = body.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
		if (!el) return;
		const top = root.scrollTop + (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - 16;
		root.scrollTo({ top, behavior: 'smooth' });
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if libraryState.openDoc !== null || libraryState.openDocStatus === 'loading'}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="backdrop" role="presentation" onclick={handleBackdropClick}></div>
	<div class="overlay" role="dialog" aria-modal="true" aria-label={libraryState.openDoc?.title ?? 'Document'}>
		<div class="overlay-header">
			<div class="nav-group">
				<button class="nav-btn" onclick={() => libraryState.openPrevDoc()} disabled={!libraryState.hasPrev} aria-label="Previous document">‹</button>
				<button class="nav-btn" onclick={() => libraryState.openNextDoc()} disabled={!libraryState.hasNext} aria-label="Next document">›</button>
			</div>
			<span class="doc-title">{libraryState.openDoc?.title ?? ''}</span>
			<div class="decide-group" role="group" aria-label="Curation decision">
				{#each DECISIONS as d (d)}
					<button
						class="decide-btn decide-{d}"
						class:active={libraryState.openDoc?.decision === d}
						aria-pressed={libraryState.openDoc?.decision === d}
						onclick={() => decide(d)}
					>{d}</button>
				{/each}
			</div>
			<button class="close-btn" onclick={close} aria-label="Close">×</button>
		</div>

		<div class="overlay-body">
			{#if libraryState.openDocStatus === 'loading'}
				<div class="state-center">
					<span class="spinner" aria-label="Loading"></span>
					<p class="state-msg">loading…</p>
				</div>
			{:else if libraryState.openDocStatus === 'error'}
				<div class="state-center">
					<p class="state-msg error">couldn't load this document.</p>
				</div>
			{:else if libraryState.openDoc}
				{@const doc = libraryState.openDoc}
				<div class="doc-scroll" bind:this={scrollEl}>
					<div class="reader-grid">
						<DocInfoPanel {toc} {activeAnchor} {doc} onJump={handleJump} />
						<div class="prose-col">
							<h2 class="doc-heading">{doc.title}</h2>
							<div class="doc-body" bind:this={bodyEl}>
								{#if doc.body && doc.body.trim().length > 0}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html bodyHtml}
								{:else}
									<p class="empty-note">(no body)</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 299;
		background: var(--backdrop-overlay);
	}

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
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.20);
		flex-shrink: 0;
	}

	.doc-title {
		font-family: var(--font-prose);
		font-size: 0.95rem;
		color: var(--clr-text);
		flex: 1;
		min-width: 0;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0 1rem;
	}

	.nav-group, .decide-group { display: flex; gap: 0.3rem; }
	.nav-btn, .decide-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.2rem 0.5rem; cursor: pointer; transition: all 0.15s;
	}
	.nav-btn:disabled { opacity: 0.3; cursor: default; }
	.decide-btn:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.decide-btn.active { border-color: var(--clr-text); opacity: 1; }
	.decide-delete.active { color: var(--clr-danger); border-color: var(--clr-danger); }

	.close-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}
	.close-btn:hover { color: var(--clr-text); }

	.overlay-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.state-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: center;
		justify-content: center;
	}

	.state-msg {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--clr-text);
	}
	.state-msg.error { color: var(--clr-danger); }

	.spinner {
		display: inline-block;
		width: 20px;
		height: 20px;
		border: 2px solid rgba(var(--ui-rgb), 0.15);
		border-top-color: var(--clr-text);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.doc-scroll {
		flex: 1;
		overflow-y: auto;
		width: 100%;
	}

	.reader-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		max-width: 760px;
		margin: 0 auto;
		padding: 0 1.25rem 2rem;
	}
	@media (min-width: 900px) {
		.reader-grid {
			grid-template-columns: minmax(0, 720px) 240px;
			gap: 2rem;
			max-width: 1040px;
			padding: 2rem 1.5rem;
		}
		.reader-grid :global(.sidebar) {
			position: sticky;
			top: 2rem;
			align-self: start;
			max-height: calc(100vh - 4rem);
			overflow-y: auto;
			grid-column: 2;
			grid-row: 1;
		}
		.prose-col {
			grid-column: 1;
			grid-row: 1;
		}
	}
	.prose-col { min-width: 0; padding-top: 2rem; }
	@media (min-width: 900px) { .prose-col { padding-top: 0; } }

	.doc-heading {
		font-family: var(--font-prose);
		font-weight: normal;
		font-size: 1.4rem;
		color: var(--clr-text);
		margin: 0 0 1rem;
	}

	.doc-body {
		margin-top: 1.5rem;
		border-top: 1px solid rgba(var(--ui-rgb), 0.15);
		padding-top: 1.5rem;
	}

	.empty-note {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		color: var(--clr-text);
		opacity: 0.5;
	}

	:global(.doc-body h1),
	:global(.doc-body h2),
	:global(.doc-body h3) {
		font-family: var(--font-prose);
		color: var(--clr-text);
		font-weight: normal;
		margin-top: 2rem;
	}
	:global(.doc-body h1) { font-size: 1.3rem; border-bottom: 1px solid rgba(var(--ui-rgb),0.25); padding-bottom: 0.5rem; }
	:global(.doc-body h2) { font-size: 1.05rem; }
	:global(.doc-body h3) { font-size: 0.92rem; }
	:global(.doc-body p) { line-height: 1.9; color: var(--clr-text); margin-bottom: 1rem; }
	:global(.doc-body a) { color: var(--clr-text); }
	:global(.doc-body blockquote) {
		border-left: 2px solid rgba(var(--ui-rgb),0.38);
		margin: 1rem 0;
		padding: 0.3rem 1rem;
		color: var(--clr-text);
		font-style: italic;
	}
	:global(.doc-body code) {
		font-family: var(--font-ui);
		font-size: 0.82em;
		background: rgba(var(--ui-rgb),0.12);
		padding: 0.1em 0.35em;
		color: var(--clr-text);
	}
	:global(.doc-body pre) {
		background: rgba(var(--ui-rgb),0.08);
		border: 1px solid rgba(var(--ui-rgb),0.20);
		padding: 1rem;
		overflow-x: auto;
	}
	:global(.doc-body ul, .doc-body ol) { line-height: 1.8; color: var(--clr-text); padding-left: 1.5rem; }
</style>

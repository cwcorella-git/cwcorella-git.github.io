<script lang="ts">
	import { renderMarkdown } from '$lib/admin/markdown';
	import { libraryState } from '$lib/library/libraryState.svelte';

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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if libraryState.openDoc !== null || libraryState.openDocStatus === 'loading'}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="backdrop" role="presentation" onclick={handleBackdropClick}></div>
	<div class="overlay" role="dialog" aria-modal="true" aria-label={libraryState.openDoc?.title ?? 'Document'}>
		<div class="overlay-header">
			<span class="doc-title">{libraryState.openDoc?.title ?? ''}</span>
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
				<div class="doc-scroll">
					<h2 class="doc-heading">{doc.title}</h2>

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
							{#each doc.tags as tag (tag)}
								<span class="chip">{tag}</span>
							{/each}
						</div>
					{/if}

					{#if doc.collections.length > 0}
						<div class="chip-row">
							{#each doc.collections as collection (collection)}
								<span class="chip chip-collection">{collection}</span>
							{/each}
						</div>
					{/if}

					<div class="doc-body">
						{#if doc.body && doc.body.trim().length > 0}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html bodyHtml}
						{:else}
							<p class="empty-note">(no body)</p>
						{/if}
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
	}

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
		padding: 2rem;
		max-width: 760px;
		margin: 0 auto;
		width: 100%;
	}

	.doc-heading {
		font-family: var(--font-prose);
		font-weight: normal;
		font-size: 1.4rem;
		color: var(--clr-text);
		margin: 0 0 1rem;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		color: var(--clr-text);
		margin: 0 0 1rem;
	}
	.meta-grid dt {
		opacity: 0.55;
		text-transform: uppercase;
	}
	.meta-grid dd {
		margin: 0;
		opacity: 0.85;
	}

	.badge {
		display: inline-block;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-family: var(--font-ui);
		font-size: 0.5rem;
		opacity: 0.85;
		margin-bottom: 0.8rem;
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
	}

	.chip {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.15rem 0.5rem;
		color: var(--clr-text);
		opacity: 0.75;
	}
	.chip-collection { opacity: 0.9; }

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

	@media (max-width: 640px) {
		.doc-scroll { padding: 1.25rem; }
	}
</style>

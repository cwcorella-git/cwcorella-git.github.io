<script lang="ts">
	import { adminState, writeQueue, journalCache, journalIndexState } from '$lib/admin/state.svelte';
	import { encryptDoc, decryptDoc } from '$lib/admin/crypto';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { toast } from '$lib/admin/toast.svelte';
	import { generateJournalSlug } from '$lib/admin/slug';
	import { addAgeUnits } from '$lib/garden/state';
	import type { JournalMeta } from '$lib/types';

	// ── index ─────────────────────────────────────────────────────────────
	let indexError = $state('');

	$effect(() => {
		if (adminState.active && !journalIndexState.loaded) loadIndex();
	});

	async function loadIndex() {
		indexError = '';
		try {
			const res = await fetch('/docs/private/journals-index.enc');
			if (!res.ok) throw new Error(res.status === 404
				? 'Index not found — run scripts/encrypt-journals.mjs first.'
				: `HTTP ${res.status}`);
			const enc = await res.json();
			const json = await decryptDoc(enc, adminState.contentKey);
			journalIndexState.set(JSON.parse(json));
		} catch (e: unknown) {
			indexError = e instanceof Error && e.name === 'OperationError'
				? 'Incorrect content key.'
				: (e instanceof Error ? e.message : 'Failed to load index.');
		}
	}

	async function saveIndex(newIndex: JournalMeta[], message: string, extraUpdates: { path: string; content: string }[] = [], deletions: string[] = []) {
		const encIndex = await encryptDoc(JSON.stringify(newIndex), adminState.contentKey);
		writeQueue.push({
			domain: 'journals-index',
			encIndexJson: JSON.stringify(encIndex),
			extraUpdates,
			deletions,
			message
		});
		journalIndexState.set(newIndex);
	}

	// ── reader ────────────────────────────────────────────────────────────
	let readerEntry = $state<JournalMeta | null>(null);
	let readerHtml = $state('');
	let readerLoading = $state(false);

	async function openReader(entry: JournalMeta) {
		readerEntry = entry;
		readerHtml = '';
		readerLoading = true;
		try {
			const cached = journalCache.get(entry.slug);
			if (cached) {
				readerHtml = renderMarkdown(cached);
				return;
			}
			const res = await fetch(`/docs/private/journals/${entry.slug}.enc`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const markdown = await decryptDoc(await res.json(), adminState.contentKey);
			readerHtml = renderMarkdown(markdown);
		} catch (e: unknown) {
			toast.error(e instanceof Error && e.name === 'OperationError'
				? 'incorrect content key'
				: (e instanceof Error ? e.message : 'Failed to load.'));
			readerEntry = null;
		} finally {
			readerLoading = false;
		}
	}

	function closeReader() { readerEntry = null; readerHtml = ''; }

	// ── editor (create / edit) ────────────────────────────────────────────
	let editorMode = $state<'none' | 'create' | 'edit'>('none');
	let editorEntry = $state<JournalMeta | null>(null);
	let editorTitle = $state('');
	let editorDate = $state('');
	let editorContent = $state('');
	let editorLoading = $state(false);
	let editorSaving = $state(false);

	function startCreate() {
		editorMode = 'create';
		editorEntry = null;
		editorTitle = '';
		editorDate = new Date().toISOString().slice(0, 10);
		editorContent = '';
	}

	async function startEdit(entry: JournalMeta) {
		editorMode = 'edit';
		editorEntry = entry;
		editorTitle = entry.title;
		editorDate = entry.date ?? '';
		editorContent = '';
		editorLoading = true;
		try {
			const cached = journalCache.get(entry.slug);
			if (cached) {
				editorContent = cached;
				return;
			}
			const res = await fetch(`/docs/private/journals/${entry.slug}.enc`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			editorContent = await decryptDoc(await res.json(), adminState.contentKey);
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Failed to load content.');
			editorMode = 'none';
		} finally {
			editorLoading = false;
		}
	}

	function closeEditor() { editorMode = 'none'; editorEntry = null; }

	async function saveEditor() {
		const title = editorTitle.trim();
		if (!title) { toast.error('Title is required.'); return; }
		editorSaving = true;
		try {
			const slug = editorMode === 'create'
				? await generateJournalSlug(editorContent, journalIndexState.entries.map(e => e.slug))
				: editorEntry!.slug;

			journalCache.set(slug, editorContent);
			const encContent = await encryptDoc(editorContent, adminState.contentKey);
			const meta: JournalMeta = { slug, title, date: editorDate.trim() || null };
			const newIndex = editorMode === 'create'
				? [meta, ...journalIndexState.entries]
				: journalIndexState.entries.map(e => e.slug === slug ? meta : e);

			await saveIndex(
				newIndex,
				editorMode === 'create' ? `add journal: ${title}` : `update journal: ${title}`,
				[{ path: `static/docs/private/journals/${slug}.enc`, content: JSON.stringify(encContent) }]
			);
			addAgeUnits(editorMode === 'create' ? 30 : 10);
			closeEditor();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			editorSaving = false;
		}
	}

	// ── delete ────────────────────────────────────────────────────────────
	let confirmingSlug = $state<string | null>(null);
	let deleteSaving = $state(false);

	async function deleteEntry(entry: JournalMeta) {
		deleteSaving = true;
		try {
			await saveIndex(
				journalIndexState.entries.filter(e => e.slug !== entry.slug),
				`delete journal: ${entry.title}`,
				[],
				[`static/docs/private/journals/${entry.slug}.enc`]
			);
			confirmingSlug = null;
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Delete failed.');
		} finally {
			deleteSaving = false;
		}
	}

	// ── actions ───────────────────────────────────────────────────────────
	function focusOnMount(node: HTMLElement) { node.focus(); }

	// ── keyboard ──────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (readerEntry) closeReader();
			else if (editorMode !== 'none') closeEditor();
			else { confirmingSlug = null; }
		}
	}
</script>

<svelte:head><title>journals — cwcorella</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if adminState.active}

<!-- ── reader overlay ─────────────────────────────────────────────────── -->
{#if readerEntry}
	<div class="overlay-backdrop" role="presentation" onclick={closeReader}></div>
	<div class="reader" role="dialog" aria-modal="true">
		<div class="overlay-header">
			<div class="reader-meta">
				<span class="reader-title">{readerEntry.title}</span>
				{#if readerEntry.date}<span class="dim">{readerEntry.date}</span>{/if}
			</div>
			<button class="close-btn" onclick={closeReader} aria-label="Close">×</button>
		</div>
		<div class="reader-body">
			{#if readerLoading}
				<p class="status">decrypting…</p>
			{:else}
				<h1 class="reader-doc-title">{readerEntry.title}</h1>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html readerHtml}
			{/if}
		</div>
	</div>
{/if}

<!-- ── editor overlay ─────────────────────────────────────────────────── -->
{#if editorMode !== 'none'}
	<div class="overlay-backdrop" role="presentation" onclick={closeEditor}></div>
	<div class="editor" role="dialog" aria-modal="true">
		<div class="overlay-header">
			<div class="editor-header-meta">
				<span class="overlay-label">{editorMode === 'create' ? 'new entry' : 'edit entry'}</span>
				{#if editorMode === 'edit' && editorEntry}
					<span class="editor-slug-line dim">{editorEntry.slug}{editorEntry.date ? ' · ' + editorEntry.date : ''}</span>
				{/if}
			</div>
			<button class="close-btn" onclick={closeEditor} aria-label="Close">×</button>
		</div>
		<div class="editor-body">
			{#if editorLoading}
				<p class="status">decrypting…</p>
			{:else}
				<div class="editor-fields">
					<div class="field-row">
						<label class="field">
							<span class="field-label">title</span>
							<input type="text" bind:value={editorTitle} placeholder="Entry title" />
						</label>
						<label class="field field-narrow">
							<span class="field-label">date</span>
							<input type="text" bind:value={editorDate} placeholder="YYYY-MM-DD" />
						</label>
					</div>
					<label class="field">
						<span class="field-label">content (markdown)</span>
						<textarea bind:value={editorContent} rows={20} placeholder="# Title&#10;&#10;Write here…" spellcheck="true"></textarea>
					</label>
				</div>
				<div class="editor-footer">
					<button onclick={closeEditor} disabled={editorSaving}>cancel</button>
					<button class="save-btn" onclick={saveEditor} disabled={editorSaving}>
						{editorSaving ? 'saving…' : 'save'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- ── main page ──────────────────────────────────────────────────────── -->
<div class="page">
	<div class="inner">
		<div class="page-header">
			<h1 class="heading">journals</h1>
			{#if journalIndexState.loaded}
				<button class="new-btn" onclick={startCreate}>+ new</button>
			{/if}
		</div>

		{#if indexError}
			<p class="status error">{indexError}</p>
		{:else if !journalIndexState.loaded}
			<p class="status">decrypting index…</p>
		{:else if journalIndexState.entries.length === 0}
			<p class="status">no entries — click + new or run scripts/encrypt-journals.mjs to populate.</p>
		{:else}
			<ul class="list">
				{#each journalIndexState.entries as entry (entry.slug)}
					<li>
						{#if confirmingSlug === entry.slug}
							<div class="entry-row confirm-row">
								<span class="dim">delete "{entry.title}"?</span>
								<div class="row-actions">
									<button class="action-btn danger" onclick={() => deleteEntry(entry)} disabled={deleteSaving}>
										{deleteSaving ? '…' : 'confirm'}
									</button>
									<button class="action-btn" onclick={() => confirmingSlug = null}>cancel</button>
								</div>
							</div>
						{:else}
							<div class="entry-row">
								<button class="entry-title-btn" onclick={() => openReader(entry)}>
									<span class="entry-title">{entry.title}</span>
									<span class="entry-meta">{entry.slug}{entry.date ? ' · ' + entry.date : ''}</span>
								</button>
								<div class="row-actions">
									<button class="action-btn" onclick={() => startEdit(entry)} title="Edit content">edit</button>
									<button class="action-btn danger" onclick={() => confirmingSlug = entry.slug} title="Delete">×</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="count">{journalIndexState.entries.length} entries</p>
		{/if}
	</div>
</div>

{/if}

<style>
	/* ── page ─────────────────────────────────────────────── */
	.page {
		min-height: 100vh;
		padding-top: 4rem;
	}
	.inner {
		position: relative; z-index: 1;
		max-width: 760px; margin: 0 auto;
		padding: 3rem 2rem 6rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
	}
	.page-header {
		display: flex; align-items: baseline; justify-content: space-between;
		margin-bottom: 2.5rem;
	}
	.heading {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1rem; font-weight: normal;
		letter-spacing: 0.12em; color: var(--clr-text-secondary); margin: 0;
	}
	.new-btn {
		background: none;
		border: 1px solid var(--glass-border);
		color: var(--clr-text-secondary);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s;
	}
	.new-btn:hover { color: var(--clr-text-primary); border-color: var(--glass-border); }

	.status { font-family: 'Courier New', Courier, monospace; font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text-muted); }
	.status.error { color: #c07050; }
	.dim { font-family: 'Courier New', Courier, monospace; font-size: 0.6rem; letter-spacing: 0.06em; color: var(--clr-text-faint); }

	/* ── list ─────────────────────────────────────────────── */
	.list { list-style: none; margin: 0; padding: 0; }

	.entry-row {
		display: flex; align-items: center; gap: 1rem;
		border-bottom: 1px solid rgba(100, 75, 40, 0.09);
	}
	.confirm-row { gap: 1.5rem; }

	.entry-title-btn {
		flex: 1; background: none; border: none; cursor: pointer;
		text-align: left; padding: 0.85rem 0; transition: color 0.15s;
		display: flex; flex-direction: column; gap: 0.15rem;
	}
	.entry-title-btn:hover .entry-title { color: var(--clr-text-primary); }

	.entry-title {
		font-family: var(--font-prose);
		font-size: 0.95rem; color: var(--clr-text-primary); line-height: 1.4;
	}
	.entry-meta {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em; color: var(--clr-text-secondary);
	}

	.row-actions {
		display: flex; gap: 0.5rem; flex-shrink: 0; margin-left: auto;
	}

	.action-btn {
		background: none; border: none; cursor: pointer;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.52rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text-faint); padding: 0 0.3rem; transition: color 0.15s;
	}
	.action-btn:hover:not(:disabled) { color: var(--clr-text-primary); }
	.action-btn.danger:hover:not(:disabled) { color: #c07050; }
	.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.count {
		margin-top: 2rem; font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem; letter-spacing: 0.1em; color: var(--clr-text-muted);
	}

	/* ── overlays shared ──────────────────────────────────── */
	.overlay-backdrop {
		position: fixed; inset: 0; z-index: 299;
		background: var(--backdrop-overlay);
	}
	.overlay-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1.2rem 2rem;
		border-bottom: 1px solid rgba(100, 75, 40, 0.12);
		flex-shrink: 0;
	}
	.editor-header-meta { display: flex; flex-direction: column; gap: 0.2rem; }
	.editor-slug-line { font-size: 0.58rem; letter-spacing: 0.06em; }
	.overlay-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: #7a5020;
	}
	.close-btn {
		background: none; border: none; color: #b09070;
		font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s;
	}
	.close-btn:hover { color: #7a5020; }

	/* ── reader ───────────────────────────────────────────── */
	.reader {
		position: fixed; inset: 0; z-index: 300;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex; flex-direction: column; overflow: hidden;
	}
	.reader-meta { display: flex; align-items: baseline; gap: 1rem; }
	.reader-title { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 0.95rem; color: #3d2e1a; }
	.reader-body {
		flex: 1; overflow-y: auto; padding: 2.5rem 3rem;
		max-width: 72ch; margin: 0 auto; width: 100%;
	}
	.reader-doc-title {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1.3rem; font-weight: normal;
		color: #3d2e1a; margin: 0 0 2rem; line-height: 1.3;
		border-bottom: 1px solid rgba(100, 75, 40, 0.15);
		padding-bottom: 1.2rem;
	}
	.reader-body :global(h1), .reader-body :global(h2), .reader-body :global(h3) {
		font-family: Georgia, 'Times New Roman', Times, serif; font-weight: normal;
		color: #5a3a10; margin: 2rem 0 0.75rem; line-height: 1.3;
	}
	.reader-body :global(h1) { font-size: 1.2rem; }
	.reader-body :global(h2) { font-size: 1rem; }
	.reader-body :global(h3) { font-size: 0.9rem; }
	.reader-body :global(p) { color: #4a3820; font-size: 0.95rem; line-height: 1.85; margin: 0 0 1.1rem; }
	.reader-body :global(blockquote) { border-left: 2px solid rgba(100,75,40,0.25); margin: 1.2rem 0; padding: 0.1rem 1.2rem; color: #8a6a40; font-style: italic; }
	.reader-body :global(code) { font-family: 'Courier New', Courier, monospace; font-size: 0.82em; background: rgba(100,75,40,0.07); padding: 0.1em 0.35em; color: #7a5020; }
	.reader-body :global(pre) { background: rgba(100,75,40,0.04); border: 1px solid rgba(100,75,40,0.12); padding: 1rem 1.2rem; overflow-x: auto; margin: 1.2rem 0; }
	.reader-body :global(ul), .reader-body :global(ol) { color: #4a3820; font-size: 0.95rem; line-height: 1.85; padding-left: 1.5rem; margin: 0 0 1rem; }
	.reader-body :global(hr) { border: none; border-top: 1px solid rgba(100,75,40,0.12); margin: 2rem 0; }

	/* ── editor ───────────────────────────────────────────── */
	.editor {
		position: fixed; inset: 0; z-index: 300;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex; flex-direction: column; overflow: hidden;
	}
	.editor-body { flex: 1; overflow-y: auto; padding: 1.8rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
	.editor-fields { display: flex; flex-direction: column; gap: 0.9rem; max-width: 860px; }
	.field-row { display: grid; grid-template-columns: 1fr auto; gap: 0.9rem; }
	.field-narrow { width: 160px; }
	.field { display: flex; flex-direction: column; gap: 0.3rem; }
	.field-label { font-family: 'Courier New', Courier, monospace; font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: #9a7a50; }
	.editor-fields input[type="text"],
	.editor-fields textarea {
		background: rgba(100, 75, 40, 0.04);
		border: 1px solid rgba(100, 75, 40, 0.18);
		color: #3d2e1a;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.85rem; padding: 0.45rem 0.6rem; outline: none;
		transition: border-color 0.15s; width: 100%;
	}
	.editor-fields input:focus, .editor-fields textarea:focus { border-color: rgba(100, 75, 40, 0.4); }
	.editor-fields textarea { resize: vertical; line-height: 1.6; min-height: 400px; }
	.editor-footer {
		display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.8rem;
		border-top: 1px solid rgba(100, 75, 40, 0.1); max-width: 860px;
	}
	.editor-footer button {
		background: none; border: 1px solid rgba(100, 75, 40, 0.2);
		color: #8a6a40; font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer; transition: all 0.15s;
	}
	.editor-footer button:hover:not(:disabled) { color: #7a5020; border-color: rgba(100, 75, 40, 0.4); }
	.editor-footer button:disabled { opacity: 0.5; cursor: not-allowed; }
	.save-btn { background: rgba(100,75,40,0.07) !important; border-color: rgba(100,75,40,0.3) !important; color: #7a5020 !important; }
</style>

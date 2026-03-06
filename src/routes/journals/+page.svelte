<script lang="ts">
	import { adminState } from '$lib/admin/state.svelte';
	import { encryptDoc, decryptDoc } from '$lib/admin/crypto';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { commitFiles } from '$lib/admin/github';
	import { toast } from '$lib/admin/toast.svelte';

	interface JournalMeta { slug: string; title: string; date: string | null; }

	// ── index ─────────────────────────────────────────────────────────────
	let index = $state<JournalMeta[]>([]);
	let indexLoaded = $state(false);
	let indexError = $state('');

	$effect(() => {
		if (adminState.active && !indexLoaded) loadIndex();
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
			index = JSON.parse(json);
			indexLoaded = true;
		} catch (e: unknown) {
			indexError = e instanceof Error && e.name === 'OperationError'
				? 'Incorrect content key.'
				: (e instanceof Error ? e.message : 'Failed to load index.');
		}
	}

	async function saveIndex(newIndex: JournalMeta[], message: string, extraUpdates: { path: string; content: string }[] = [], deletions: string[] = []) {
		const encIndex = await encryptDoc(JSON.stringify(newIndex), adminState.contentKey);
		await commitFiles(
			adminState.pat,
			[{ path: 'static/docs/private/journals-index.enc', content: JSON.stringify(encIndex) }, ...extraUpdates],
			message,
			deletions
		);
		index = newIndex;
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

	// ── inline rename ─────────────────────────────────────────────────────
	let renamingSlug = $state<string | null>(null);
	let renameValue = $state('');
	let renameSaving = $state(false);

	function startRename(entry: JournalMeta) {
		renamingSlug = entry.slug;
		renameValue = entry.title;
	}

	async function commitRename(entry: JournalMeta) {
		const newTitle = renameValue.trim();
		if (!newTitle || newTitle === entry.title) { renamingSlug = null; return; }
		renameSaving = true;
		try {
			await saveIndex(
				index.map(e => e.slug === entry.slug ? { ...e, title: newTitle } : e),
				`rename journal: ${newTitle}`
			);
			renamingSlug = null;
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Rename failed.');
		} finally {
			renameSaving = false;
		}
	}

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
				? Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('')
				: editorEntry!.slug;

			const encContent = await encryptDoc(editorContent, adminState.contentKey);
			const meta: JournalMeta = { slug, title, date: editorDate.trim() || null };
			const newIndex = editorMode === 'create'
				? [meta, ...index]
				: index.map(e => e.slug === slug ? meta : e);

			await saveIndex(
				newIndex,
				editorMode === 'create' ? `add journal: ${title}` : `update journal: ${title}`,
				[{ path: `static/docs/private/journals/${slug}.enc`, content: JSON.stringify(encContent) }]
			);
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
				index.filter(e => e.slug !== entry.slug),
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

	// ── codename (opaque stable display id derived from slug) ─────────────
	function codename(slug: string): string {
		return `${slug.slice(0, 4)}-${slug.slice(4, 8)}-${slug.slice(8, 12)}`;
	}

	// ── actions ───────────────────────────────────────────────────────────
	function focusOnMount(node: HTMLElement) { node.focus(); }

	// ── keyboard ──────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (readerEntry) closeReader();
			else if (editorMode !== 'none') closeEditor();
			else { renamingSlug = null; confirmingSlug = null; }
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
			<span class="overlay-label">{editorMode === 'create' ? 'new entry' : 'edit entry'}</span>
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
	<div class="glow" aria-hidden="true"></div>
	<div class="inner">
		<div class="page-header">
			<h1 class="heading">journals</h1>
			{#if indexLoaded}
				<button class="new-btn" onclick={startCreate}>+ new</button>
			{/if}
		</div>

		{#if indexError}
			<p class="status error">{indexError}</p>
		{:else if !indexLoaded}
			<p class="status">decrypting index…</p>
		{:else if index.length === 0}
			<p class="status">no entries — click + new or run scripts/encrypt-journals.mjs to populate.</p>
		{:else}
			<ul class="list">
				{#each index as entry (entry.slug)}
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
								{#if renamingSlug === entry.slug}
									<input
										class="rename-input"
										type="text"
										bind:value={renameValue}
										onkeydown={(e) => { if (e.key === 'Enter') commitRename(entry); if (e.key === 'Escape') renamingSlug = null; }}
										onblur={() => commitRename(entry)}
										disabled={renameSaving}
										use:focusOnMount
									/>
								{:else}
									<button class="entry-title-btn" onclick={() => openReader(entry)}>
										{codename(entry.slug)}
									</button>
								{/if}
								{#if entry.date}
									<span class="entry-date dim">{entry.date}</span>
								{/if}
								<div class="row-actions">
									<button class="action-btn" onclick={() => startRename(entry)} title="Rename">rename</button>
									<button class="action-btn" onclick={() => startEdit(entry)} title="Edit content">edit</button>
									<button class="action-btn danger" onclick={() => confirmingSlug = entry.slug} title="Delete">×</button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="count">{index.length} entries</p>
		{/if}
	</div>
</div>

{/if}

<style>
	/* ── page ─────────────────────────────────────────────── */
	.page {
		min-height: 100vh;
		padding-top: 4rem;
		background-image:
			linear-gradient(rgba(200, 150, 60, 0.016) 1px, transparent 1px),
			linear-gradient(90deg, rgba(200, 150, 60, 0.016) 1px, transparent 1px);
		background-size: 48px 48px;
	}
	.glow {
		position: fixed; top: 30%; left: 60%;
		width: 600px; height: 600px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(200, 120, 40, 0.05) 0%, transparent 65%);
		pointer-events: none; z-index: 0;
	}
	.inner {
		position: relative; z-index: 1;
		max-width: 760px; margin: 0 auto;
		padding: 3rem 2rem 6rem;
	}
	.page-header {
		display: flex; align-items: baseline; justify-content: space-between;
		margin-bottom: 2.5rem;
	}
	.heading {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1rem; font-weight: normal;
		letter-spacing: 0.12em; color: #c8a060; margin: 0;
	}
	.new-btn {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.25);
		color: #8a7858;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s;
	}
	.new-btn:hover { color: #c8a060; border-color: rgba(200, 150, 60, 0.5); }

	.status { font-family: 'Courier New', Courier, monospace; font-size: 0.65rem; letter-spacing: 0.08em; color: #5a4e38; }
	.status.error { color: #c07050; }
	.dim { font-family: 'Courier New', Courier, monospace; font-size: 0.6rem; letter-spacing: 0.06em; color: #4e4232; }

	/* ── list ─────────────────────────────────────────────── */
	.list { list-style: none; margin: 0; padding: 0; }

	.entry-row {
		display: flex; align-items: center; gap: 1rem;
		border-bottom: 1px solid rgba(200, 150, 60, 0.09);
		padding: 0.6rem 0; min-height: 2.6rem;
	}
	.confirm-row { gap: 1.5rem; }

	.entry-title-btn {
		flex: 1; background: none; border: none; cursor: pointer;
		text-align: left; color: #c0b088; font-size: 0.95rem; line-height: 1.4;
		padding: 0; transition: color 0.15s;
	}
	.entry-title-btn:hover { color: #d4b878; }

	.entry-date { flex-shrink: 0; white-space: nowrap; }

	.rename-input {
		flex: 1; background: rgba(200, 150, 60, 0.04);
		border: none; border-bottom: 1px solid rgba(200, 150, 60, 0.4);
		color: #c0b088; font-size: 0.95rem; padding: 0.1rem 0.2rem;
		outline: none; font-family: inherit;
	}

	.row-actions {
		display: flex; gap: 0.5rem; flex-shrink: 0; margin-left: auto;
	}

	.action-btn {
		background: none; border: none; cursor: pointer;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.52rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: #3a3028; padding: 0 0.3rem; transition: color 0.15s;
	}
	.action-btn:hover:not(:disabled) { color: #8a7858; }
	.action-btn.danger:hover:not(:disabled) { color: #c07050; }
	.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.count {
		margin-top: 2rem; font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem; letter-spacing: 0.1em; color: #5a4e38;
	}

	/* ── overlays shared ──────────────────────────────────── */
	.overlay-backdrop {
		position: fixed; inset: 0; z-index: 299;
		background: rgba(0, 0, 0, 0.55);
	}
	.overlay-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1.2rem 2rem;
		border-bottom: 1px solid rgba(200, 150, 60, 0.12);
		flex-shrink: 0;
	}
	.overlay-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: #c8a060;
	}
	.close-btn {
		background: none; border: none; color: #6a5a40;
		font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s;
	}
	.close-btn:hover { color: #c8a060; }

	/* ── reader ───────────────────────────────────────────── */
	.reader {
		position: fixed; inset: 0; z-index: 300;
		background: #0c0902; display: flex; flex-direction: column; overflow: hidden;
	}
	.reader-meta { display: flex; align-items: baseline; gap: 1rem; }
	.reader-title { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 0.95rem; color: #c0b088; }
	.reader-body {
		flex: 1; overflow-y: auto; padding: 2.5rem 3rem;
		max-width: 72ch; margin: 0 auto; width: 100%;
	}
	.reader-doc-title {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1.3rem; font-weight: normal;
		color: #d4b878; margin: 0 0 2rem; line-height: 1.3;
		border-bottom: 1px solid rgba(200, 150, 60, 0.15);
		padding-bottom: 1.2rem;
	}
	.reader-body :global(h1), .reader-body :global(h2), .reader-body :global(h3) {
		font-family: Georgia, 'Times New Roman', Times, serif; font-weight: normal;
		color: #c8a060; margin: 2rem 0 0.75rem; line-height: 1.3;
	}
	.reader-body :global(h1) { font-size: 1.2rem; }
	.reader-body :global(h2) { font-size: 1rem; }
	.reader-body :global(h3) { font-size: 0.9rem; }
	.reader-body :global(p) { color: #c0b088; font-size: 0.95rem; line-height: 1.85; margin: 0 0 1.1rem; }
	.reader-body :global(blockquote) { border-left: 2px solid rgba(200,150,60,0.3); margin: 1.2rem 0; padding: 0.1rem 1.2rem; color: #8a7858; }
	.reader-body :global(code) { font-family: 'Courier New', Courier, monospace; font-size: 0.82em; background: rgba(200,150,60,0.07); padding: 0.1em 0.35em; color: #b89858; }
	.reader-body :global(pre) { background: rgba(200,150,60,0.05); border: 1px solid rgba(200,150,60,0.12); padding: 1rem 1.2rem; overflow-x: auto; margin: 1.2rem 0; }
	.reader-body :global(ul), .reader-body :global(ol) { color: #c0b088; font-size: 0.95rem; line-height: 1.85; padding-left: 1.5rem; margin: 0 0 1rem; }
	.reader-body :global(hr) { border: none; border-top: 1px solid rgba(200,150,60,0.12); margin: 2rem 0; }

	/* ── editor ───────────────────────────────────────────── */
	.editor {
		position: fixed; inset: 0; z-index: 300;
		background: #0c0902; display: flex; flex-direction: column; overflow: hidden;
	}
	.editor-body { flex: 1; overflow-y: auto; padding: 1.8rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
	.editor-fields { display: flex; flex-direction: column; gap: 0.9rem; max-width: 860px; }
	.field-row { display: grid; grid-template-columns: 1fr auto; gap: 0.9rem; }
	.field-narrow { width: 160px; }
	.field { display: flex; flex-direction: column; gap: 0.3rem; }
	.field-label { font-family: 'Courier New', Courier, monospace; font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: #6a5a40; }
	.editor-fields input[type="text"],
	.editor-fields textarea {
		background: rgba(200, 150, 60, 0.04);
		border: 1px solid rgba(200, 150, 60, 0.18);
		color: #c0b088;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.85rem; padding: 0.45rem 0.6rem; outline: none;
		transition: border-color 0.15s; width: 100%;
	}
	.editor-fields input:focus, .editor-fields textarea:focus { border-color: rgba(200, 150, 60, 0.45); }
	.editor-fields textarea { resize: vertical; line-height: 1.6; min-height: 400px; }
	.editor-footer {
		display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.8rem;
		border-top: 1px solid rgba(200, 150, 60, 0.08); max-width: 860px;
	}
	.editor-footer button {
		background: none; border: 1px solid rgba(200, 150, 60, 0.2);
		color: #6a5a40; font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer; transition: all 0.15s;
	}
	.editor-footer button:hover:not(:disabled) { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }
	.editor-footer button:disabled { opacity: 0.5; cursor: not-allowed; }
	.save-btn { background: rgba(200,150,60,0.08) !important; border-color: rgba(200,150,60,0.35) !important; color: #c8a060 !important; }
</style>

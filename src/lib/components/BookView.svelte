<script lang="ts">
	import { untrack } from 'svelte';
	import type { Book, BookDoc, BookLink } from '$lib/types';
	import type { TocEntry } from '$lib/admin/markdown';
	import type { EncryptedDoc } from '$lib/admin/crypto';
	import { adminState, booksState, writeQueue } from '$lib/admin/state.svelte';
	import { renderMarkdown, extractToc } from '$lib/admin/markdown';
	import { toast } from '$lib/admin/toast.svelte';
	import YearPicker from '$lib/components/YearPicker.svelte';

	let {
		book,
		onClose,
		onSaved
	}: {
		book: Book;
		onClose: () => void;
		onSaved: (books: Book[]) => void;
	} = $props();

	// ── mode ─────────────────────────────────────────────────────
	type Mode = 'view' | 'edit';
	let mode = $state<Mode>('view');

	// ── doc load ─────────────────────────────────────────────────
	type LoadState = 'loading' | 'ready' | 'empty' | 'error';
	let loadState = $state<LoadState>(untrack(() => book.doc ? 'loading' : 'empty'));
	let loadError = $state('');
	let html = $state('');
	let toc = $state<TocEntry[]>([]);
	let docContent = $state('');   // raw markdown (edit mode + annotation gesture)
	let contentEl = $state<HTMLElement | undefined>();

	async function loadDoc() {
		if (!book.doc) { loadState = 'empty'; return; }
		if (book.doc.visibility === 'admin' && !adminState.active) { loadState = 'empty'; return; }
		loadState = 'loading';
		try {
			let md: string;
			if (book.doc.visibility === 'public') {
				const res = await fetch(`/docs/public/${book.doc.file}.md`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				md = await res.text();
			} else {
				const res = await fetch(`/docs/private/${book.doc.file}.enc`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const enc: EncryptedDoc = await res.json();
				try {
					md = await adminState.decryptContent(enc);
				} catch {
					toast.error('Incorrect content key.');
					loadState = 'error';
					loadError = 'Incorrect content key.';
					return;
				}
			}
			docContent = md;
			toc = extractToc(md);
			html = renderMarkdown(md);
			loadState = 'ready';
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load document.';
			toast.error(loadError);
			loadState = 'error';
		}
	}

	$effect(() => { loadDoc(); });

	// ── edit-mode form fields ─────────────────────────────────────
	let title    = $state(untrack(() => book.title));
	let author   = $state(untrack(() => book.author));
	let year     = $state(untrack(() => book.year?.toString() ?? ''));
	let category = $state(untrack(() => book.category));
	let links    = $state<BookLink[]>(untrack(() => book.links ? [...book.links.map(l => ({ ...l }))] : []));
	let notes    = $state(untrack(() => book.notes ?? ''));
	let docVisibility = $state<'public' | 'admin'>(untrack(() => book.doc?.visibility ?? 'public'));
	let saving   = $state(false);
	let validationError = $state('');

	function addLink() { links = [...links, { name: '', url: '' }]; }
	function removeLink(i: number) { links = links.filter((_, idx) => idx !== i); }

	function slugify(text: string): string {
		return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40);
	}

	async function save() {
		if (!title.trim() || !author.trim() || !category.trim()) {
			validationError = 'Title, author, and category are required.';
			return;
		}
		saving = true;
		validationError = '';
		try {
			const books = booksState.books;
			const slug = `${book.id}-${slugify(title)}`;
			let doc: BookDoc | undefined = book.doc;
			const extraUpdates: { path: string; content: string }[] = [];

			if (docContent.trim()) {
				if (docVisibility === 'admin') {
					const encrypted = await adminState.encryptContent(docContent.trim());
					extraUpdates.push({ path: `static/docs/private/${slug}.enc`, content: JSON.stringify(encrypted) });
				} else {
					extraUpdates.push({ path: `static/docs/public/${slug}.md`, content: docContent.trim() });
				}
				doc = { file: slug, visibility: docVisibility };
			}

			const validLinks = links.filter(l => l.name.trim() && l.url.trim())
				.map(l => ({ name: l.name.trim(), url: l.url.trim() }));

			const entry: Book = {
				id: book.id,
				title: title.trim(),
				author: author.trim(),
				year: year ? parseInt(year, 10) : null,
				category: category.trim(),
				...(validLinks.length ? { links: validLinks } : {}),
				...(notes.trim() ? { notes: notes.trim() } : {}),
				...(doc ? { doc } : {}),
				...(book.read ? { read: book.read } : {})
			};

			const updatedBooks = books.map(b => b.id === book.id ? entry : b);
			writeQueue.push({ domain: 'books', books: updatedBooks, extraUpdates });
			booksState.set(updatedBooks);

			// Update rendered view from new content
			if (docContent.trim()) {
				toc = extractToc(docContent);
				html = renderMarkdown(docContent);
				loadState = 'ready';
			}

			mode = 'view';
			onSaved(updatedBooks);
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			saving = false;
		}
	}

	async function deleteBook() {
		const books = booksState.books;
		const deletions: string[] = [];
		if (book.doc) {
			const dir = book.doc.visibility === 'admin' ? 'private' : 'public';
			const ext = book.doc.visibility === 'admin' ? 'enc' : 'md';
			deletions.push(`static/docs/${dir}/${book.doc.file}.${ext}`);
		}
		const updatedBooks = books.filter(b => b.id !== book.id);
		writeQueue.push({ domain: 'books', books: updatedBooks, deletions });
		booksState.set(updatedBooks);
		onSaved(updatedBooks);
		onClose();
	}

	// ── notes panel (view mode) ───────────────────────────────────
	let notesOpen = $state(false);

	// ── TOC scroll ───────────────────────────────────────────────
	function scrollTo(anchor: string) {
		const el = (contentEl as HTMLElement)?.querySelector(`#${anchor}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// ── annotation gesture ────────────────────────────────────────
	// Ctrl+click on textarea while text is selected → add <ann> tag
	let textareaEl = $state<HTMLTextAreaElement | undefined>();
	let annPopup = $state<{ x: number; y: number; selStart: number; selEnd: number; selected: string } | null>(null);
	let annNote = $state('');
	let annInputEl = $state<HTMLInputElement | undefined>();

	function handleTextareaMousedown(e: MouseEvent) {
		if (!e.ctrlKey) return;
		e.preventDefault();
		const ta = textareaEl as HTMLTextAreaElement;
		const selStart = ta.selectionStart;
		const selEnd = ta.selectionEnd;
		if (selStart === selEnd) return;  // nothing selected
		const selected = ta.value.slice(selStart, selEnd);
		const rect = ta.getBoundingClientRect();
		annPopup = { x: rect.left + 16, y: rect.top + 40, selStart, selEnd, selected };
		annNote = '';
		// Focus input on next tick
		setTimeout(() => annInputEl?.focus(), 0);
	}

	function confirmAnnotation() {
		if (!annPopup) return;
		const note = annNote.trim();
		if (!note) { annPopup = null; return; }
		const { selStart, selEnd, selected } = annPopup;
		const tag = `<ann note="${note.replace(/"/g, '&quot;')}">${selected}</ann>`;
		docContent = docContent.slice(0, selStart) + tag + docContent.slice(selEnd);
		annPopup = null;
		annNote = '';
	}

	function cancelAnnotation() { annPopup = null; annNote = ''; }

	// ── keyboard ──────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (annPopup) { cancelAnnotation(); return; }
			if (notesOpen) { notesOpen = false; return; }
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="overlay" role="dialog" aria-modal="true" aria-label={book.title}>

	<!-- Header -->
	<div class="overlay-header">
		<div class="header-left">
			{#if mode === 'view'}
				<span class="book-title">{book.title}</span>
				<span class="book-meta">{book.author}{book.year ? ` · ${book.year}` : ''} · <span class="book-cat">{book.category}</span></span>
			{:else}
				<div class="edit-header-fields">
					<input class="title-input" type="text" bind:value={title} placeholder="Title *" />
					<div class="meta-inputs">
						<input class="meta-input" type="text" bind:value={author} placeholder="Author *" />
						<span class="meta-sep">·</span>
						<input class="meta-input short" type="text" bind:value={category} placeholder="Category *" list="bv-categories" />
						<span class="meta-sep">·</span>
						<YearPicker value={year ? parseInt(year) : null} onchange={(y) => year = y?.toString() ?? ''} />
					</div>
					{#if validationError}
						<p class="val-error">{validationError}</p>
					{/if}
				</div>
			{/if}
		</div>
		<div class="header-right">
			{#if adminState.active && mode === 'view'}
				<button class="hdr-btn" onclick={() => { mode = 'edit'; }}>edit</button>
			{/if}
			{#if mode === 'edit'}
				<button class="hdr-btn save-btn" onclick={save} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
				<button class="hdr-btn" onclick={() => { mode = 'view'; validationError = ''; }}>cancel</button>
			{/if}
			<button class="close-btn" onclick={onClose} aria-label="Close">×</button>
		</div>
	</div>

	<!-- Body -->
	<div class="overlay-body">
		{#if mode === 'view'}
			<!-- TOC sidebar -->
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
							>{entry.text}</button>
						{/each}
					</nav>
				</aside>
			{/if}

			<!-- Main content -->
			<div class="content-area">
				{#if loadState === 'loading'}
					<div class="state-center"><span class="spinner" aria-label="Loading"></span></div>
				{:else if loadState === 'error'}
					<div class="state-center"><p class="state-msg error">{loadError}</p></div>
				{:else if loadState === 'empty'}
					<div class="state-center"><p class="state-msg">no document attached</p></div>
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="doc-content" bind:this={contentEl}>{@html html}</div>
				{/if}
			</div>

		{:else}
			<!-- Edit mode body -->
			<div class="edit-body">
				<div class="edit-main">
					<!-- Doc textarea -->
					<div class="doc-section">
						<div class="field-label">
							document
							<span class="vis-toggle">
								<label class="radio"><input type="radio" bind:group={docVisibility} value="public" /> public</label>
								<label class="radio"><input type="radio" bind:group={docVisibility} value="admin" /> admin (enc)</label>
							</span>
						</div>
						<div class="textarea-wrap">
							<textarea
								bind:this={textareaEl}
								bind:value={docContent}
								rows={20}
								placeholder="# Title&#10;&#10;Paste markdown… (ctrl+click selection to add hover annotation)"
								onmousedown={handleTextareaMousedown}
							></textarea>
							{#if annPopup}
								<div class="ann-popup" style="top:{annPopup.y - (textareaEl?.getBoundingClientRect().top ?? 0)}px">
									<span class="ann-selected">"{annPopup.selected.slice(0, 40)}{annPopup.selected.length > 40 ? '…' : ''}"</span>
									<input
										bind:this={annInputEl}
										type="text"
										bind:value={annNote}
										placeholder="annotation note…"
										onkeydown={(e) => { if (e.key === 'Enter') confirmAnnotation(); if (e.key === 'Escape') cancelAnnotation(); }}
									/>
									<div class="ann-btns">
										<button onclick={confirmAnnotation}>add</button>
										<button onclick={cancelAnnotation}>cancel</button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="edit-sidebar">
					<!-- Notes -->
					<div class="sidebar-section">
						<div class="field-label">notes (admin-only)</div>
						<textarea bind:value={notes} rows={6} placeholder="Private annotations…"></textarea>
					</div>

					<!-- Sources -->
					<div class="sidebar-section">
						<div class="field-label">sources</div>
						{#each links as link, i}
							<div class="link-row">
								<input type="text" bind:value={link.name} placeholder="Name" />
								<input type="url" bind:value={link.url} placeholder="https://…" />
								<button type="button" class="remove-link" onclick={() => removeLink(i)} aria-label="Remove">×</button>
							</div>
						{/each}
						<button type="button" class="add-link" onclick={addLink}>+ add source</button>
					</div>

					<!-- Delete -->
					<div class="sidebar-section sidebar-footer">
						<button class="delete-btn" onclick={deleteBook}>delete book</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Footer (view mode only) -->
	{#if mode === 'view'}
		<div class="overlay-footer">
			{#if book.links && book.links.length > 0}
				<div class="footer-sources">
					{#each book.links as link}
						<a href={link.url} target="_blank" rel="noopener noreferrer">{link.name} ↗</a>
					{/each}
				</div>
			{/if}
			{#if adminState.active && book.notes}
				<div class="notes-toggle-wrap">
					<button class="notes-btn" onclick={() => notesOpen = !notesOpen} aria-expanded={notesOpen}>
						notes {notesOpen ? '▴' : '▾'}
					</button>
					{#if notesOpen}
						<div class="notes-panel">{book.notes}</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Datalist for categories (edit mode) -->
<datalist id="bv-categories">
	{#each [...new Set(booksState.books.map(b => b.category))].sort() as cat}
		<option value={cat}></option>
	{/each}
</datalist>

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

	/* ── header ─────────────────────────────────────────────────── */
	.overlay-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1rem 2rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.20);
		flex-shrink: 0;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.book-title {
		font-size: 0.95rem;
		color: var(--clr-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.book-meta {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.7;
	}

	.book-cat { opacity: 0.5; }

	.hdr-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.hdr-btn:hover:not(:disabled) { border-color: rgba(var(--ui-rgb), 0.4); }
	.hdr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.save-btn { background: rgba(var(--ui-rgb), 0.06); }

	.close-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: opacity 0.15s;
		opacity: 0.6;
	}
	.close-btn:hover { opacity: 1; }

	/* edit-mode header fields */
	.edit-header-fields { display: flex; flex-direction: column; gap: 0.4rem; flex: 1; }
	.title-input {
		background: none;
		border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.25);
		color: var(--clr-text);
		font-family: var(--font-prose);
		font-size: 0.95rem;
		padding: 0.1rem 0;
		outline: none;
		width: 100%;
	}
	.meta-inputs {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.meta-input {
		background: none;
		border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.20);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		padding: 0.1rem 0;
		outline: none;
		min-width: 80px;
	}
	.meta-input.short { max-width: 120px; }
	.meta-sep { font-family: var(--font-ui); font-size: 0.6rem; color: var(--clr-text); opacity: 0.4; }
	.val-error { font-family: var(--font-ui); font-size: 0.6rem; color: var(--clr-danger); margin: 0; }

	/* ── body ────────────────────────────────────────────────────── */
	.overlay-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	/* view mode */
	.toc {
		width: 220px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: 1.5rem 1rem;
		border-right: 1px solid rgba(var(--ui-rgb), 0.18);
	}
	.toc-label {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.5;
		margin: 0 0 0.8rem;
	}
	.toc-item {
		display: block;
		width: 100%;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		line-height: 1.5;
		color: var(--clr-text);
		opacity: 0.7;
		padding: 0.2rem 0;
		transition: opacity 0.15s;
	}
	.toc-item:hover { opacity: 1; }
	.toc-h2 { padding-left: 0.8rem; }
	.toc-h3 { padding-left: 1.6rem; font-size: 0.58rem; }

	.content-area {
		flex: 1;
		overflow-y: auto;
		display: flex;
	}

	.state-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.state-msg {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		color: var(--clr-text);
		opacity: 0.5;
	}
	.state-msg.error { color: var(--clr-danger); opacity: 1; }

	.spinner {
		display: inline-block;
		width: 20px; height: 20px;
		border: 2px solid rgba(var(--ui-rgb), 0.15);
		border-top-color: var(--clr-text);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.doc-content {
		padding: 2rem;
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
	}

	/* text alignment classes usable in markdown via raw HTML */
	:global(.doc-content .text-left)   { text-align: left; }
	:global(.doc-content .text-center) { text-align: center; }
	:global(.doc-content .text-right)  { text-align: right; }

	/* typography */
	:global(.doc-content h1),
	:global(.doc-content h2),
	:global(.doc-content h3) {
		font-family: var(--font-prose);
		color: var(--clr-text);
		font-weight: normal;
		margin-top: 2rem;
	}
	:global(.doc-content h1) { font-size: 1.4rem; border-bottom: 1px solid rgba(var(--ui-rgb),0.25); padding-bottom: 0.5rem; }
	:global(.doc-content h2) { font-size: 1.1rem; }
	:global(.doc-content h3) { font-size: 0.95rem; }
	:global(.doc-content p)  { line-height: 1.9; color: var(--clr-text); margin-bottom: 1rem; }
	:global(.doc-content a)  { color: var(--clr-text); }
	:global(.doc-content blockquote) {
		border-left: 2px solid rgba(var(--ui-rgb),0.38);
		margin: 1rem 0; padding: 0.3rem 1rem;
		color: var(--clr-text); font-style: italic;
	}
	:global(.doc-content code) {
		font-family: var(--font-ui); font-size: 0.82em;
		background: rgba(var(--ui-rgb),0.12); padding: 0.1em 0.35em; color: var(--clr-text);
	}
	:global(.doc-content pre) {
		background: rgba(var(--ui-rgb),0.08);
		border: 1px solid rgba(var(--ui-rgb),0.20);
		padding: 1rem; overflow-x: auto;
	}
	:global(.doc-content ul, .doc-content ol) { line-height: 1.8; color: var(--clr-text); padding-left: 1.5rem; }

	/* annotation spans */
	:global(.doc-content .ann) {
		position: relative;
		border-bottom: 1.5px dotted rgba(var(--ui-rgb), 0.55);
		cursor: help;
	}
	:global(.doc-content .ann::after) {
		content: attr(data-note);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		max-width: 280px;
		min-width: 120px;
		max-height: 200px;
		overflow-y: auto;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.62rem;
		line-height: 1.6;
		letter-spacing: 0.04em;
		padding: 0.5rem 0.7rem;
		white-space: pre-wrap;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 10;
	}
	:global(.doc-content .ann:hover::after) { opacity: 1; pointer-events: auto; }

	/* edit mode */
	.edit-body {
		flex: 1;
		display: flex;
		overflow: hidden;
		gap: 0;
	}

	.edit-main {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.edit-sidebar {
		width: 260px;
		flex-shrink: 0;
		overflow-y: auto;
		padding: 1.5rem 1.2rem;
		border-left: 1px solid rgba(var(--ui-rgb), 0.14);
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.field-label {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.55;
		margin-bottom: 0.4rem;
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.doc-section { display: flex; flex-direction: column; gap: 0.4rem; }

	textarea {
		width: 100%;
		background: rgba(var(--ui-rgb), 0.04);
		border: 1px solid rgba(var(--ui-rgb), 0.14);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.78rem;
		padding: 0.6rem 0.75rem;
		outline: none;
		resize: vertical;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}
	textarea:focus { border-color: rgba(var(--ui-rgb), 0.3); }

	.textarea-wrap { position: relative; }

	.vis-toggle {
		display: flex;
		gap: 0.7rem;
		margin-left: auto;
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.75;
		cursor: pointer;
	}
	.radio input { width: auto; }

	/* annotation popup */
	.ann-popup {
		position: absolute;
		left: 1rem;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 0.7rem 0.8rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 260px;
	}
	.ann-selected {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		color: var(--clr-dark-text);
		opacity: 0.6;
		font-style: italic;
	}
	.ann-popup input {
		background: rgba(var(--dark-panel-rgb), 0.06);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.18);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		padding: 0.35rem 0.5rem;
		outline: none;
		width: 100%;
		box-sizing: border-box;
	}
	.ann-btns {
		display: flex;
		gap: 0.4rem;
	}
	.ann-btns button {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.18);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ann-btns button:hover { border-color: rgba(var(--dark-panel-rgb), 0.38); }

	.sidebar-section { display: flex; flex-direction: column; gap: 0.4rem; }
	.sidebar-footer { margin-top: auto; }

	.link-row {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		gap: 0.35rem;
		align-items: center;
		margin-bottom: 0.35rem;
	}
	.link-row input {
		background: rgba(var(--ui-rgb), 0.04);
		border: 1px solid rgba(var(--ui-rgb), 0.14);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		padding: 0.3rem 0.4rem;
		outline: none;
		width: 100%;
		box-sizing: border-box;
	}
	.remove-link {
		background: none; border: none;
		color: var(--clr-text); opacity: 0.5;
		font-size: 0.9rem; cursor: pointer;
		padding: 0 0.15rem; line-height: 1;
		transition: opacity 0.15s;
	}
	.remove-link:hover { opacity: 1; }
	.add-link {
		background: none;
		border: 1px dashed rgba(var(--ui-rgb), 0.18);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		opacity: 0.6;
		transition: all 0.15s;
		align-self: flex-start;
	}
	.add-link:hover { opacity: 1; border-color: rgba(var(--ui-rgb), 0.32); }

	.delete-btn {
		background: none;
		border: 1px solid rgba(180,60,60,0.3);
		color: var(--clr-danger-muted);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		align-self: flex-start;
	}
	.delete-btn:hover { color: var(--clr-danger); border-color: rgba(180,60,60,0.6); }

	/* ── footer (view mode) ──────────────────────────────────────── */
	.overlay-footer {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.6rem 2rem;
		border-top: 1px solid rgba(var(--ui-rgb), 0.16);
		gap: 1rem;
	}

	.footer-sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}
	.footer-sources a {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		opacity: 0.6;
		text-decoration: none;
		transition: opacity 0.15s;
	}
	.footer-sources a:hover { opacity: 1; }

	.notes-toggle-wrap { position: relative; margin-left: auto; }
	.notes-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.18);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
		opacity: 0.6;
		transition: all 0.15s;
	}
	.notes-btn:hover { opacity: 1; }

	.notes-panel {
		position: absolute;
		bottom: calc(100% + 6px);
		right: 0;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 0.8rem 1rem;
		min-width: 240px;
		max-width: 320px;
		max-height: 200px;
		overflow-y: auto;
		font-family: var(--font-ui);
		font-size: 0.65rem;
		line-height: 1.7;
		color: var(--clr-dark-text);
		white-space: pre-wrap;
		z-index: 10;
	}

	/* ── mobile ──────────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.toc { display: none; }
		.edit-sidebar { display: none; }
		.overlay-header { padding: 0.8rem 1rem; }
		.overlay-footer { padding: 0.5rem 1rem; }
		.doc-content { padding: 1.25rem; }
	}
</style>

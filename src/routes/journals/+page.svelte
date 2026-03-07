<script lang="ts">
	import { adminState, writeQueue, journalCache, journalIndexState } from '$lib/admin/state.svelte';
	import { archiveState } from '$lib/admin/archive.svelte';
	import { encryptDoc, decryptDoc } from '$lib/admin/crypto';
	import { sealContent, sealContentKey } from '$lib/admin/tlock';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { toast } from '$lib/admin/toast.svelte';
	import { generateJournalSlug } from '$lib/admin/slug';
	import type { JournalMeta } from '$lib/types';

	// ── sealed manifest (public, no key required) ─────────────────────────
	type SealedManifestEntry = { slug: string; title: string };
	let sealedManifest = $state<SealedManifestEntry[]>([]);

	$effect(() => {
		if (!adminState.active && !archiveState.mode) {
			fetch('/docs/private/sealed-manifest.json')
				.then(r => r.ok ? r.json() : [])
				.then((data: SealedManifestEntry[]) => { sealedManifest = data; })
				.catch(() => {});
		}
	});

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
			if (entry.sealed) {
				if (archiveState.mode) {
					const markdown = await archiveState.decryptSealedEntry(entry.slug);
					readerHtml = renderMarkdown(markdown);
				} else {
					readerHtml = '';  // sealed message shown in template
				}
				return;
			}
			// Regular .enc entry
			if (archiveState.mode) {
				const markdown = await archiveState.decryptEntry(entry.slug);
				readerHtml = renderMarkdown(markdown);
				return;
			}
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

	function closeEditor() { editorMode = 'none'; editorEntry = null; sealConfirmOpen = false; }

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
			closeEditor();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			editorSaving = false;
		}
	}

	// ── seal ──────────────────────────────────────────────────────────────
	let sealConfirmOpen = $state(false);
	let sealLoading = $state(false);

	async function commitSeal() {
		sealConfirmOpen = false;
		sealLoading = true;
		try {
			const plain = editorContent;

			// 1. tlock-encrypt the content
			const tlockCt = await sealContent(plain);

			// 2. Seal the content key if content-key.tlock doesn't exist yet
			const ckCheck = await fetch('/docs/private/content-key.tlock', { method: 'HEAD' });
			const ckExtra: { path: string; content: string }[] = [];
			if (!ckCheck.ok) {
				const sealedKey = await sealContentKey(adminState.contentKey);
				ckExtra.push({ path: 'static/docs/private/content-key.tlock', content: sealedKey });
			}

			// 3. Update index: sealed = true
			const newMeta: JournalMeta = { ...editorEntry!, sealed: true };
			const newIndex = journalIndexState.entries.map(e => e.slug === editorEntry!.slug ? newMeta : e);

			// 4. Update sealed-manifest.json (public)
			const currentManifest: SealedManifestEntry[] = await fetch('/docs/private/sealed-manifest.json')
				.then(r => r.ok ? r.json() : [])
				.catch(() => []);
			const newManifest = [
				...currentManifest.filter((m: SealedManifestEntry) => m.slug !== editorEntry!.slug),
				{ slug: editorEntry!.slug, title: editorEntry!.title }
			];

			// 5. Push to write queue
			await saveIndex(
				newIndex,
				`seal journal entry: ${editorEntry!.slug}`,
				[
					{ path: `static/docs/private/journals/${editorEntry!.slug}.tlock`, content: tlockCt },
					{ path: 'static/docs/private/sealed-manifest.json', content: JSON.stringify(newManifest) },
					...ckExtra,
				],
				[`static/docs/private/journals/${editorEntry!.slug}.enc`]
			);

			closeEditor();
			toast.success('Entry sealed until February 13, 2095.');
		} catch (e: unknown) {
			toast.error(e instanceof Error ? `Seal failed: ${e.message}` : 'Seal failed.');
		} finally {
			sealLoading = false;
		}
	}

	// ── delete ────────────────────────────────────────────────────────────
	let confirmingSlug = $state<string | null>(null);
	let deleteSaving = $state(false);

	async function deleteEntry(entry: JournalMeta) {
		deleteSaving = true;
		try {
			const deletions = entry.sealed
				? [`static/docs/private/journals/${entry.slug}.tlock`]
				: [`static/docs/private/journals/${entry.slug}.enc`];

			// Also remove from sealed-manifest if sealed
			const extraUpdates: { path: string; content: string }[] = [];
			if (entry.sealed) {
				const manifest: SealedManifestEntry[] = await fetch('/docs/private/sealed-manifest.json')
					.then(r => r.ok ? r.json() : [])
					.catch(() => []);
				const newManifest = manifest.filter((m: SealedManifestEntry) => m.slug !== entry.slug);
				extraUpdates.push({ path: 'static/docs/private/sealed-manifest.json', content: JSON.stringify(newManifest) });
			}

			await saveIndex(
				journalIndexState.entries.filter(e => e.slug !== entry.slug),
				`delete journal: ${entry.title}`,
				extraUpdates,
				deletions
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
			if (sealConfirmOpen) { sealConfirmOpen = false; return; }
			if (readerEntry) closeReader();
			else if (editorMode !== 'none') closeEditor();
			else { confirmingSlug = null; }
		}
	}

	// ── archive mode index ────────────────────────────────────────────────
	const activeIndex = $derived(adminState.active ? journalIndexState.entries : archiveState.index);

	// ── search ────────────────────────────────────────────────────────────
	let searchQuery = $state('');

	function matchesSearch(e: { slug: string; title?: string }) {
		const q = searchQuery.trim().toLowerCase();
		return e.slug.toLowerCase().includes(q) || (e.title?.toLowerCase().includes(q) ?? false);
	}

	let filteredEntries = $derived(
		searchQuery.trim() ? journalIndexState.entries.filter(matchesSearch) : journalIndexState.entries
	);
	let filteredArchive = $derived(
		searchQuery.trim() ? activeIndex.filter(matchesSearch) : activeIndex
	);
</script>

<svelte:head><title>journals — cwcorella</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if adminState.active || archiveState.mode}

<!-- ── reader overlay ─────────────────────────────────────────────────── -->
{#if readerEntry}
	<div class="overlay-backdrop" role="presentation" onclick={closeReader}></div>
	<div class="reader" role="dialog" aria-modal="true">
		<div class="overlay-header">
			<div class="reader-meta">
				<span class="reader-title">{readerEntry.title}</span>
				{#if readerEntry.date && !readerEntry.sealed}<span class="dim">{readerEntry.date}</span>{/if}
				{#if readerEntry.sealed}<span class="sealed-tag">sealed</span>{/if}
			</div>
			<button class="close-btn" onclick={closeReader} aria-label="Close">×</button>
		</div>
		<div class="reader-body">
			{#if readerLoading}
				<p class="status">decrypting…</p>
			{:else if readerEntry.sealed && !archiveState.mode}
				<p class="sealed-message">This entry is sealed until February 13, 2095.</p>
			{:else}
				<h1 class="reader-doc-title">{readerEntry.title}</h1>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html readerHtml}
			{/if}
		</div>
	</div>
{/if}

<!-- ── editor overlay ─────────────────────────────────────────────────── -->
{#if editorMode !== 'none' && adminState.active}
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
					{#if editorMode === 'edit' && !editorEntry?.sealed}
						<button class="seal-btn" onclick={() => sealConfirmOpen = true} disabled={editorSaving || sealLoading}>
							{sealLoading ? 'sealing…' : 'seal until 2095'}
						</button>
					{/if}
					<button onclick={closeEditor} disabled={editorSaving || sealLoading}>cancel</button>
					<button class="save-btn" onclick={saveEditor} disabled={editorSaving || sealLoading}>
						{editorSaving ? 'saving…' : 'save'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- ── seal confirmation modal ───────────────────────────────────────── -->
{#if sealConfirmOpen}
	<div class="overlay-backdrop seal-backdrop" role="presentation" onclick={() => sealConfirmOpen = false}></div>
	<div class="seal-modal" role="dialog" aria-modal="true" aria-label="Seal confirmation">
		<p class="seal-modal-title">Seal this entry until February 13, 2095?</p>
		<p class="seal-modal-body">
			This entry will be encrypted to the drand beacon round that unlocks on your 100th birthday.
			You will not be able to read or edit it until then.<br /><br />
			<strong>If you have not yet sealed an entry:</strong> your current content key will be locked
			into <code>content-key.tlock</code>. Do not change your content key after sealing.<br /><br />
			This cannot be undone.
		</p>
		<div class="seal-modal-actions">
			<button onclick={() => sealConfirmOpen = false}>cancel</button>
			<button class="seal-confirm-btn" onclick={commitSeal}>seal entry →</button>
		</div>
	</div>
{/if}

<!-- ── main page ──────────────────────────────────────────────────────── -->
<div class="page">
	<div class="page-header">
			<div class="search-bar">
				<input
					type="text"
					class="search-input"
					placeholder="search entries…"
					bind:value={searchQuery}
					autocomplete="off"
					spellcheck="false"
					aria-label="Search journal entries"
					onkeydown={(e) => { if (e.key === 'Escape') { searchQuery = ''; (e.target as HTMLInputElement).blur(); } }}
				/>
				{#if archiveState.mode}<span class="mode-tag">archive</span>{/if}
			</div>
			{#if journalIndexState.loaded && adminState.active}
				<button class="new-btn" onclick={startCreate}>+ new</button>
			{/if}
		</div>

	<div class="inner">
		{#if adminState.active}
			{#if indexError}
				<p class="status error">{indexError}</p>
			{:else if !journalIndexState.loaded}
				<p class="status">decrypting index…</p>
			{:else if journalIndexState.entries.length === 0}
				<p class="status">no entries — click + new or run scripts/encrypt-journals.mjs to populate.</p>
			{:else}
				<ul class="list">
					{#each filteredEntries as entry (entry.slug)}
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
										{#if entry.sealed}
											<span class="entry-title">{entry.slug}</span>
											<span class="entry-meta sealed-meta">sealed · Feb 13, 2095</span>
										{:else}
											<span class="entry-title">{entry.slug}</span>
											{#if entry.date}<span class="entry-meta">{entry.date}</span>{/if}
										{/if}
									</button>
									<div class="row-actions">
										{#if !entry.sealed}
											<button class="action-btn" onclick={() => startEdit(entry)} title="Edit content">edit</button>
										{/if}
										<button class="action-btn danger" onclick={() => confirmingSlug = entry.slug} title="Delete">×</button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="count">{filteredEntries.length}{filteredEntries.length !== journalIndexState.entries.length ? ` of ${journalIndexState.entries.length}` : ''} {filteredEntries.length === 1 ? 'entry' : 'entries'}</p>
			{/if}
		{:else if archiveState.mode}
			{#if filteredArchive.length === 0}
				<p class="status">{searchQuery.trim() ? 'no matches.' : 'no entries.'}</p>
			{:else}
				<ul class="list">
					{#each filteredArchive as entry (entry.slug)}
						<li>
							<div class="entry-row">
								<button class="entry-title-btn" onclick={() => openReader(entry)}>
									{#if entry.sealed}
										<span class="entry-title">{entry.slug}</span>
										<span class="entry-meta sealed-meta">sealed · unlocked Feb 13, 2095</span>
									{:else}
										<span class="entry-title">{entry.slug}</span>
										{#if entry.date}<span class="entry-meta">{entry.date}</span>{/if}
									{/if}
								</button>
							</div>
						</li>
					{/each}
				</ul>
				<p class="count">{filteredArchive.length}{filteredArchive.length !== activeIndex.length ? ` of ${activeIndex.length}` : ''} {filteredArchive.length === 1 ? 'entry' : 'entries'}</p>
			{/if}
		{/if}
	</div>
</div>

{:else}

<!-- ── public view (no login) ─────────────────────────────────────────── -->
<div class="page">
	<div class="page-header">
		<h1 class="heading">journals</h1>
	</div>
	<div class="inner">
		{#if sealedManifest.length > 0}
			<ul class="list">
				{#each sealedManifest as entry (entry.slug)}
					<li>
						<div class="entry-row">
							<div class="entry-title-btn" style="cursor: default;">
								<span class="entry-title">{entry.title}</span>
								<span class="entry-meta sealed-meta">sealed · unlocks Feb 13, 2095</span>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="status">private — admin access required.</p>
		{/if}
	</div>
</div>

{/if}

<style>
	/* ── page ─────────────────────────────────────────────── */
	.page {
		min-height: 100vh;
		padding-top: 6rem;
	}
	.page-header {
		max-width: 760px; margin: 0 auto;
		padding: 0.75rem 2rem 0.6rem;
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		border-bottom: none;
	}
	.inner {
		position: relative; z-index: 1;
		max-width: 760px; margin: 0 auto;
		padding: 2rem 2rem 6rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		border-top: none;
	}
	.heading {
		font-family: var(--font-prose);
		font-size: 1rem; font-weight: normal;
		letter-spacing: 0.12em; color: var(--clr-text); margin: 0;
	}
	.search-bar {
		display: flex; align-items: center; gap: 0.75rem;
		flex: 1;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
	}
	.search-input {
		background: none; border: none; outline: none; flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0;
		caret-color: currentColor;
	}
	.search-input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.mode-tag {
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em;
		color: var(--clr-text); opacity: 0.5;
		white-space: nowrap;
	}
	.new-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s;
	}
	.new-btn:hover { color: var(--clr-text); border-color: rgba(var(--ui-rgb), 0.45); }

	.status { font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text); }
	.status.error { color: var(--clr-danger); }
	.dim { font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.06em; color: var(--clr-text); }

	/* ── list ─────────────────────────────────────────────── */
	.list { list-style: none; margin: 0; padding: 0; }

	.entry-row {
		display: flex; align-items: center; gap: 1rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
	}
	.confirm-row { gap: 1.5rem; padding: 0.85rem 0; }

	.entry-title-btn {
		flex: 1; background: none; border: none; cursor: pointer;
		text-align: left; padding: 0.85rem 0; transition: color 0.15s;
		display: flex; flex-direction: column; gap: 0.15rem;
	}
	.entry-title-btn:hover .entry-title { color: var(--clr-text); }

	.entry-title {
		font-family: var(--font-prose);
		font-size: 0.95rem; color: var(--clr-text); line-height: 1.4;
	}
	.entry-meta {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em; color: var(--clr-text);
	}
	.sealed-meta { opacity: 0.55; font-style: italic; }

	.row-actions {
		display: flex; gap: 0.5rem; flex-shrink: 0; margin-left: auto;
	}

	.action-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.52rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); padding: 0 0.3rem; transition: color 0.15s;
	}
	.action-btn:hover:not(:disabled) { color: var(--clr-text); }
	.action-btn.danger:hover:not(:disabled) { color: var(--clr-danger); }
	.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.count {
		margin-top: 2rem; font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.1em; color: var(--clr-text);
	}

	/* ── overlays shared ──────────────────────────────────── */
	.overlay-backdrop {
		position: fixed; inset: 0; z-index: 299;
		background: var(--backdrop-overlay);
	}
	.overlay-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1.2rem 2rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.20);
		flex-shrink: 0;
	}
	.editor-header-meta { display: flex; flex-direction: column; gap: 0.2rem; }
	.editor-slug-line { font-size: 0.58rem; letter-spacing: 0.06em; }
	.overlay-label {
		font-family: var(--font-ui);
		font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--clr-text);
	}
	.close-btn {
		background: none; border: none; color: var(--clr-text);
		font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s;
	}
	.close-btn:hover { color: var(--clr-text); }

	/* ── reader ───────────────────────────────────────────── */
	.reader {
		position: fixed; inset: 0; z-index: 300;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex; flex-direction: column; overflow: hidden;
	}
	.reader-meta { display: flex; align-items: baseline; gap: 1rem; }
	.reader-title { font-family: var(--font-prose); font-size: 0.95rem; color: var(--clr-text); }
	.sealed-tag {
		font-family: var(--font-ui);
		font-size: 0.55rem; letter-spacing: 0.1em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.5; font-style: italic;
	}
	.reader-body {
		flex: 1; overflow-y: auto; padding: 2.5rem 3rem;
		max-width: 72ch; margin: 0 auto; width: 100%;
	}
	.sealed-message {
		font-family: var(--font-ui);
		font-size: 0.75rem; letter-spacing: 0.06em; color: var(--clr-text);
		opacity: 0.6; margin-top: 3rem; text-align: center;
	}
	.reader-doc-title {
		font-family: var(--font-prose);
		font-size: 1.3rem; font-weight: normal;
		color: var(--clr-text); margin: 0 0 2rem; line-height: 1.3;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.25);
		padding-bottom: 1.2rem;
	}
	.reader-body :global(h1), .reader-body :global(h2), .reader-body :global(h3) {
		font-family: var(--font-prose); font-weight: normal;
		color: var(--clr-text); margin: 2rem 0 0.75rem; line-height: 1.3;
	}
	.reader-body :global(h1) { font-size: 1.2rem; }
	.reader-body :global(h2) { font-size: 1rem; }
	.reader-body :global(h3) { font-size: 0.9rem; color: var(--clr-text); }
	.reader-body :global(p) { color: var(--clr-text); font-size: 0.95rem; line-height: 1.85; margin: 0 0 1.1rem; }
	.reader-body :global(blockquote) { border-left: 2px solid rgba(var(--ui-rgb),0.38); margin: 1.2rem 0; padding: 0.1rem 1.2rem; color: var(--clr-text); font-style: italic; }
	.reader-body :global(code) { font-family: var(--font-ui); font-size: 0.82em; background: rgba(var(--ui-rgb),0.12); padding: 0.1em 0.35em; color: var(--clr-text); }
	.reader-body :global(pre) { background: rgba(var(--ui-rgb),0.08); border: 1px solid rgba(var(--ui-rgb),0.20); padding: 1rem 1.2rem; overflow-x: auto; margin: 1.2rem 0; }
	.reader-body :global(ul), .reader-body :global(ol) { color: var(--clr-text); font-size: 0.95rem; line-height: 1.85; padding-left: 1.5rem; margin: 0 0 1rem; }
	.reader-body :global(hr) { border: none; border-top: 1px solid rgba(var(--ui-rgb),0.20); margin: 2rem 0; }

	/* ── editor ───────────────────────────────────────────── */
	.editor {
		position: fixed; inset: 0; z-index: 300;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex; flex-direction: column; overflow: hidden;
	}
	/* Dark-panel overrides for shared classes used in editor context */
	.editor .overlay-header { border-bottom-color: rgba(var(--dark-panel-rgb), 0.15); }
	.editor .overlay-label { color: var(--clr-dark-text); }
	.editor .close-btn { color: var(--clr-dark-text); }
	.editor .close-btn:hover { color: var(--clr-dark-text); }
	.editor .dim { color: var(--clr-dark-text); }
	.editor .status { color: var(--clr-dark-text); }
	.editor-body { flex: 1; overflow-y: auto; padding: 1.8rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
	.editor-fields { display: flex; flex-direction: column; gap: 0.9rem; max-width: 860px; }
	.field-row { display: grid; grid-template-columns: 1fr auto; gap: 0.9rem; }
	.field-narrow { width: 160px; }
	.field { display: flex; flex-direction: column; gap: 0.3rem; }
	.field-label { font-family: var(--font-ui); font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--clr-dark-text); }
	.editor-fields input[type="text"],
	.editor-fields textarea {
		background: rgba(var(--dark-panel-rgb), 0.06);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.18);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.85rem; padding: 0.45rem 0.6rem; outline: none;
		transition: border-color 0.15s; width: 100%;
	}
	.editor-fields input:focus, .editor-fields textarea:focus { border-color: rgba(var(--dark-panel-rgb), 0.38); }
	.editor-fields textarea { resize: vertical; line-height: 1.6; min-height: 400px; }
	.editor-footer {
		display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.8rem;
		border-top: 1px solid rgba(var(--dark-panel-rgb), 0.12); max-width: 860px;
	}
	.editor-footer button {
		background: none; border: 1px solid rgba(var(--dark-panel-rgb), 0.20);
		color: var(--clr-dark-text); font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer; transition: all 0.15s;
	}
	.editor-footer button:hover:not(:disabled) { color: var(--clr-dark-text); border-color: rgba(var(--dark-panel-rgb), 0.40); }
	.editor-footer button:disabled { opacity: 0.5; cursor: not-allowed; }
	.save-btn { background: rgba(var(--dark-panel-rgb),0.08) !important; border-color: rgba(var(--dark-panel-rgb),0.25) !important; color: var(--clr-dark-text) !important; }
	.seal-btn { margin-right: auto; border-color: rgba(var(--dark-panel-rgb), 0.15) !important; opacity: 0.6; }
	.seal-btn:hover:not(:disabled) { opacity: 1 !important; }

	/* ── seal confirmation modal ──────────────────────────── */
	.seal-backdrop { z-index: 399; }
	.seal-modal {
		position: fixed; top: 50%; left: 50%;
		transform: translate(-50%, -50%);
		z-index: 400;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid var(--glass-border-dark);
		padding: 2rem;
		width: min(480px, 90vw);
		display: flex; flex-direction: column; gap: 1.2rem;
	}
	.seal-modal-title {
		font-family: var(--font-ui);
		font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase;
		color: var(--clr-dark-text); margin: 0;
	}
	.seal-modal-body {
		font-family: var(--font-ui);
		font-size: 0.65rem; line-height: 1.75; letter-spacing: 0.03em;
		color: var(--clr-dark-text); opacity: 0.8; margin: 0;
	}
	.seal-modal-body code {
		background: rgba(255,255,255,0.08);
		padding: 0.1em 0.3em;
		font-size: 0.9em;
	}
	.seal-modal-actions {
		display: flex; gap: 0.5rem; justify-content: flex-end;
		padding-top: 0.8rem;
		border-top: 1px solid rgba(255,255,255,0.08);
	}
	.seal-modal-actions button {
		background: none; border: 1px solid rgba(255,255,255,0.15);
		color: var(--clr-dark-text); font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.4rem 0.9rem; cursor: pointer; transition: all 0.15s;
	}
	.seal-modal-actions button:hover { border-color: rgba(255,255,255,0.30); }
	.seal-confirm-btn { background: rgba(255,255,255,0.06) !important; }

	@media (max-width: 480px) {
		.page { padding-top: 5.5rem; }
		.page-header { padding: 0.5rem 1.25rem 0.5rem; }
		.reader-body { padding: 1.5rem 1.25rem; }
		.field-row { grid-template-columns: 1fr; }
		.field-narrow { width: 100%; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.overlay-header { padding: 1rem 1.25rem; }
		.editor-body { padding: 1.25rem; }
	}
</style>

<script lang="ts">
	import { adminState, writeQueue, linksState } from '$lib/admin/state.svelte';
	import { encryptDoc, decryptDoc } from '$lib/admin/crypto';
	import { toast } from '$lib/admin/toast.svelte';
	import type { LinkMeta } from '$lib/types';
	import CategorySection from '$lib/components/CategorySection.svelte';
	import LinkRow from '$lib/components/LinkRow.svelte';

	// ── index ─────────────────────────────────────────────────────────────
	let indexError = $state('');

	$effect(() => {
		if (adminState.active && !linksState.loaded) loadIndex();
	});

	async function loadIndex() {
		indexError = '';
		try {
			const res = await fetch('/docs/private/links-index.enc');
			if (!res.ok) throw new Error(res.status === 404
				? 'Index not found — run scripts/import-bookmarks.mjs first.'
				: `HTTP ${res.status}`);
			const enc = await res.json();
			const json = await decryptDoc(enc, adminState.contentKey);
			linksState.set(JSON.parse(json));
		} catch (e: unknown) {
			indexError = e instanceof Error && e.name === 'OperationError'
				? 'Incorrect content key.'
				: (e instanceof Error ? e.message : 'Failed to load index.');
		}
	}

	async function saveIndex(newIndex: LinkMeta[], message: string) {
		const encIndex = await encryptDoc(JSON.stringify(newIndex), adminState.contentKey);
		writeQueue.push({ domain: 'links', encIndexJson: JSON.stringify(encIndex), message });
		linksState.set(newIndex);
	}

	// ── categories ────────────────────────────────────────────────────────
	const categories = $derived(
		(() => {
			const counts: Record<string, number> = {};
			for (const l of linksState.entries) counts[l.category] = (counts[l.category] || 0) + 1;
			return Object.entries(counts)
				.filter(([cat]) => cat !== 'Uncategorized' || counts[cat] > 0)
				.sort((a, b) => {
					if (a[0] === 'Uncategorized') return 1;
					if (b[0] === 'Uncategorized') return -1;
					return b[1] - a[1];
				});
		})()
	);

	// All unique tags sorted by frequency
	const allTags = $derived(
		(() => {
			const counts: Record<string, number> = {};
			for (const l of linksState.entries) for (const t of l.tags) counts[t] = (counts[t] || 0) + 1;
			return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t);
		})()
	);

	// ── search + tag filter ───────────────────────────────────────────────
	let searchQuery = $state('');
	let activeTag = $state('');
	let suggestionsDismissed = $state(false);

	let tagSuggestions = $derived(
		(searchQuery.trim() && !activeTag)
			? allTags.filter(t => t.includes(searchQuery.trim().toLowerCase())).slice(0, 6)
			: []
	);

	let showSuggestions = $derived(tagSuggestions.length > 0 && !suggestionsDismissed);

	// Search bar sizing (same approach as reading page)
	let searchBarEl = $state<HTMLElement | undefined>();
	let searchBarWidth = $state(0);
	$effect(() => {
		if (!searchBarEl) return;
		const ro = new ResizeObserver(([e]) => { searchBarWidth = e.contentRect.width; });
		ro.observe(searchBarEl);
		return () => ro.disconnect();
	});
	const CHAR_W = 7, PILL_PAD = 24, PILL_GAP = 8, INPUT_MIN = 100, OVERFLOW_W = 30;
	let maxPills = $derived.by(() => {
		if (!searchBarWidth || !tagSuggestions.length) return 3;
		let available = searchBarWidth - INPUT_MIN;
		let used = 0, count = 0;
		for (let i = 0; i < tagSuggestions.length; i++) {
			const w = tagSuggestions[i].length * CHAR_W + PILL_PAD + PILL_GAP;
			const hasMore = i < tagSuggestions.length - 1;
			if (used + w + (hasMore ? OVERFLOW_W : 0) > available) break;
			used += w; count++;
		}
		return Math.max(1, count);
	});

	function setTag(tag: string) { activeTag = tag; searchQuery = ''; }
	function clearTag() { activeTag = ''; }
	function clearAll() { activeTag = ''; searchQuery = ''; }

	// ── category expansion state ──────────────────────────────────────────
	let manuallyExpandedCategories = $state<Set<string>>(new Set());

	function toggleCategoryExpansion(category: string) {
		const next = new Set(manuallyExpandedCategories);
		if (next.has(category)) next.delete(category);
		else next.add(category);
		manuallyExpandedCategories = next;
	}

	// Check if actively filtering (searching or filtering by tag)
	const isFiltering = $derived(!!searchQuery.trim() || !!activeTag);

	// Determine if a category should be expanded
	function shouldCategoryBeExpanded(category: string): boolean {
		// If filtering, auto-expand any category with matches
		if (isFiltering) return true;
		// Otherwise, use manual expansion state
		return manuallyExpandedCategories.has(category);
	}

	function matchesSearch(l: LinkMeta): boolean {
		if (activeTag) return l.tags.includes(activeTag);
		const q = searchQuery.trim().toLowerCase();
		if (!q) return true;
		return l.title.toLowerCase().includes(q)
			|| l.url.toLowerCase().includes(q)
			|| l.category.toLowerCase().includes(q)
			|| l.tags.some(t => t.includes(q))
			|| (l.notes?.toLowerCase().includes(q) ?? false);
	}

	let filtered = $derived(linksState.entries.filter(matchesSearch));

	// Group filtered links by category, preserving category sort order
	const grouped = $derived(
		(() => {
			const groups: Record<string, LinkMeta[]> = {};
			for (const l of filtered) {
				(groups[l.category] ??= []).push(l);
			}
			// Sort links within each group by title
			for (const arr of Object.values(groups)) arr.sort((a, b) => a.title.localeCompare(b.title));
			// Return in category order
			const catOrder = categories.map(([c]) => c);
			return catOrder
				.filter(c => groups[c])
				.map(c => ({ category: c, links: groups[c] }));
		})()
	);

	// ── selection (for bulk ops) ──────────────────────────────────────────
	let selected = $state<Set<string>>(new Set());
	let selectMode = $state(false);

	function toggleSelect(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id); else next.add(id);
		selected = next;
	}

	function selectAll() {
		selected = new Set(filtered.map(l => l.id));
	}

	function deselectAll() {
		selected = new Set();
		selectMode = false;
	}

	// ── bulk operations ──────────────────────────────────────────────────
	let bulkSaving = $state(false);

	async function bulkDelete() {
		if (selected.size === 0) return;
		bulkSaving = true;
		try {
			const newIndex = linksState.entries.filter(l => !selected.has(l.id));
			await saveIndex(newIndex, `delete ${selected.size} links`);
			toast.success(`deleted ${selected.size} links`);
			deselectAll();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Bulk delete failed.');
		} finally {
			bulkSaving = false;
		}
	}

	let bulkCategoryTarget = $state('');

	async function bulkRecategorize() {
		if (selected.size === 0 || !bulkCategoryTarget) return;
		bulkSaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				selected.has(l.id) ? { ...l, category: bulkCategoryTarget } : l
			);
			await saveIndex(newIndex, `recategorize ${selected.size} links → ${bulkCategoryTarget}`);
			toast.success(`recategorized ${selected.size} links`);
			deselectAll();
			bulkCategoryTarget = '';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Bulk recategorize failed.');
		} finally {
			bulkSaving = false;
		}
	}

	let bulkTagInput = $state('');

	async function bulkAddTag() {
		const tag = bulkTagInput.trim().toLowerCase();
		if (selected.size === 0 || !tag) return;
		bulkSaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				selected.has(l.id) && !l.tags.includes(tag)
					? { ...l, tags: [...l.tags, tag] }
					: l
			);
			await saveIndex(newIndex, `tag ${selected.size} links: ${tag}`);
			toast.success(`tagged ${selected.size} links: ${tag}`);
			deselectAll();
			bulkTagInput = '';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Bulk tag failed.');
		} finally {
			bulkSaving = false;
		}
	}

	// ── single-item edit ─────────────────────────────────────────────────
	let editingLink = $state<LinkMeta | null>(null);
	let editTitle = $state('');
	let editCategory = $state('');
	let editTags = $state('');
	let editNotes = $state('');
	let editSaving = $state(false);

	function startEdit(link: LinkMeta) {
		editingLink = link;
		editTitle = link.title;
		editCategory = link.category;
		editTags = link.tags.join(', ');
		editNotes = link.notes ?? '';
	}

	function closeEdit() { editingLink = null; }

	async function saveEdit() {
		if (!editingLink) return;
		editSaving = true;
		try {
			const tags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
			const updated: LinkMeta = {
				...editingLink,
				title: editTitle.trim() || editingLink.title,
				category: editCategory.trim() || editingLink.category,
				tags,
				notes: editNotes.trim() || undefined,
			};
			const newIndex = linksState.entries.map(l => l.id === updated.id ? updated : l);
			await saveIndex(newIndex, `update link: ${updated.title}`);
			closeEdit();
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			editSaving = false;
		}
	}

	// ── single delete ────────────────────────────────────────────────────
	let confirmingId = $state<string | null>(null);
	let deleteSaving = $state(false);

	async function deleteLink(id: string) {
		deleteSaving = true;
		try {
			const entry = linksState.entries.find(l => l.id === id);
			const newIndex = linksState.entries.filter(l => l.id !== id);
			await saveIndex(newIndex, `delete link: ${entry?.title ?? id}`);
			confirmingId = null;
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Delete failed.');
		} finally {
			deleteSaving = false;
		}
	}

	// ── add new ──────────────────────────────────────────────────────────
	let addOpen = $state(false);
	let addUrl = $state('');
	let addTitle = $state('');
	let addCategory = $state('Personal');
	let addTags = $state('');
	let addSaving = $state(false);

	async function saveAdd() {
		const url = addUrl.trim();
		if (!url) { toast.error('URL is required.'); return; }
		addSaving = true;
		try {
			const id = crypto.randomUUID().slice(0, 12);
			const tags = addTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
			const link: LinkMeta = {
				id, url,
				title: addTitle.trim() || url,
				category: addCategory.trim() || 'Personal',
				tags,
				added: new Date().toISOString().slice(0, 10),
			};
			await saveIndex([link, ...linksState.entries], `add link: ${link.title}`);
			addOpen = false;
			addUrl = ''; addTitle = ''; addCategory = 'Personal'; addTags = '';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			addSaving = false;
		}
	}

	// ── category operations ──────────────────────────────────────────────
	let catActionTarget = $state<string | null>(null);
	let catActionMode = $state<'none' | 'edit' | 'delete'>('none');
	let renameValue = $state('');
	let categorySaving = $state(false);

	function startEditCategory(cat: string) {
		catActionTarget = cat;
		renameValue = cat;
		catActionMode = 'edit';
	}

	function startRenameCategory(cat: string) {
		startEditCategory(cat);
	}

	async function commitRenameCategory() {
		const oldName = catActionTarget;
		const newName = renameValue.trim();
		if (!oldName || !newName || newName === oldName) { catActionMode = 'none'; return; }
		categorySaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				l.category === oldName ? { ...l, category: newName } : l
			);
			await saveIndex(newIndex, `rename category: ${oldName} → ${newName}`);
			toast.success(`renamed "${oldName}" → "${newName}"`);
			catActionMode = 'none';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Rename failed.');
		} finally {
			categorySaving = false;
		}
	}

	async function deleteCategory(cat: string) {
		categorySaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				l.category === cat ? { ...l, category: 'Uncategorized' } : l
			);
			await saveIndex(newIndex, `delete category: ${cat} → Uncategorized`);
			toast.success(`"${cat}" deleted — links moved to Uncategorized`);
			catActionMode = 'none';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Delete failed.');
		} finally {
			categorySaving = false;
		}
	}

	function exportCategory(cat: string) {
		const links = linksState.entries.filter(l => l.category === cat);
		const lines = [
			'<!DOCTYPE NETSCAPE-Bookmark-file-1>',
			'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
			`<TITLE>${esc(cat)}</TITLE>`,
			`<H1>${esc(cat)}</H1>`,
			'<DL><p>',
		];
		for (const l of links) {
			lines.push(`    <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor(new Date(l.added).getTime() / 1000)}">${esc(l.title)}</A>`);
		}
		lines.push('</DL><p>');
		downloadFile(lines.join('\n'), `${cat.toLowerCase().replace(/\s+/g, '-')}.html`, 'text/html');
		toast.success(`exported ${links.length} links`);
	}

	function exportAll() {
		const lines = [
			'<!DOCTYPE NETSCAPE-Bookmark-file-1>',
			'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
			'<TITLE>links</TITLE>', '<H1>links</H1>', '<DL><p>',
		];
		const grouped: Record<string, LinkMeta[]> = {};
		for (const l of linksState.entries) (grouped[l.category] ??= []).push(l);
		for (const [cat, links] of Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
			lines.push(`    <DT><H3>${esc(cat)}</H3>`, '    <DL><p>');
			for (const l of links) {
				lines.push(`        <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor(new Date(l.added).getTime() / 1000)}">${esc(l.title)}</A>`);
			}
			lines.push('    </DL><p>');
		}
		lines.push('</DL><p>');
		downloadFile(lines.join('\n'), 'all-links.html', 'text/html');
		toast.success(`exported ${linksState.entries.length} links`);
	}

	function downloadFile(content: string, filename: string, type: string) {
		const blob = new Blob([content], { type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = filename; a.click();
		URL.revokeObjectURL(url);
	}

	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	// ── strip source indicators ──────────────────────────────────────────
	let stripSaving = $state(false);
	const hasSources = $derived(linksState.entries.some(l => l.source));

	async function stripSources() {
		stripSaving = true;
		try {
			const newIndex = linksState.entries.map(({ source, ...rest }) => rest);
			await saveIndex(newIndex as LinkMeta[], 'strip source indicators');
			toast.success('source indicators removed');
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Strip failed.');
		} finally {
			stripSaving = false;
		}
	}

	// ── keyboard ──────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (catActionMode !== 'none') { catActionMode = 'none'; }
			else if (editingLink) closeEdit();
			else if (addOpen) { addOpen = false; }
			else if (selectMode) deselectAll();
			else { confirmingId = null; clearAll(); }
		}
		if (e.key === 'Enter' && !editingLink && !addOpen) { suggestionsDismissed = true; }
	}

	// ── helpers ───────────────────────────────────────────────────────────
	function domain(url: string): string {
		try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
	}
</script>

<svelte:head><title>cwcorella</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if adminState.active}

<!-- ── category edit modal ────────────────────────────────────────────── -->
{#if catActionMode === 'edit' && catActionTarget}
	<div class="overlay-backdrop" role="presentation" onclick={() => catActionMode = 'none'}></div>
	<div class="cat-edit-modal" role="dialog" aria-modal="true">
		<div class="cat-edit-header">
			<span class="cat-edit-title">Rename "{catActionTarget}"</span>
			<button class="close-btn" onclick={() => catActionMode = 'none'} aria-label="Close">×</button>
		</div>
		<input type="text" class="cat-edit-input" bind:value={renameValue} />
		<div class="cat-edit-actions">
			<button class="cat-edit-btn" onclick={() => catActionMode = 'none'} disabled={categorySaving}>cancel</button>
			<button class="cat-edit-btn" onclick={commitRenameCategory} disabled={categorySaving}>
				{categorySaving ? '…' : 'confirm'}
			</button>
		</div>
	</div>
{/if}

<!-- ── category delete confirmation ──────────────────────────────────── -->
{#if catActionMode === 'delete' && catActionTarget}
	<div class="overlay-backdrop" role="presentation" onclick={() => catActionMode = 'edit'}></div>
	<div class="seal-modal" role="dialog" aria-modal="true" aria-label="Delete confirmation">
		<p class="seal-modal-title">Delete "{catActionTarget}"?</p>
		<p class="seal-modal-body">
			Links in this category will be moved to Uncategorized. This cannot be undone.
		</p>
		<div class="seal-modal-actions">
			<button onclick={() => catActionMode = 'edit'}>cancel</button>
			<button class="seal-confirm-btn danger" onclick={() => { deleteCategory(catActionTarget!); catActionMode = 'none'; }}>
				{categorySaving ? '…' : 'delete'}
			</button>
		</div>
	</div>
{/if}

<!-- ── edit overlay ───────────────────────────────────────────────────── -->
{#if editingLink}
	<div class="overlay-backdrop" role="presentation" onclick={closeEdit}></div>
	<div class="editor" role="dialog" aria-modal="true">
		<div class="overlay-header">
			<div class="editor-header-meta">
				<span class="overlay-label">edit link</span>
				<span class="editor-url dim">{domain(editingLink.url)}</span>
			</div>
			<button class="close-btn" onclick={closeEdit} aria-label="Close">×</button>
		</div>
		<div class="editor-body">
			<div class="editor-fields">
				<label class="field">
					<span class="field-label">title</span>
					<input type="text" bind:value={editTitle} />
				</label>
				<div class="field-row">
					<label class="field">
						<span class="field-label">category</span>
						<input type="text" bind:value={editCategory} />
					</label>
					<label class="field">
						<span class="field-label">tags (comma-separated)</span>
						<input type="text" bind:value={editTags} />
					</label>
				</div>
				<label class="field">
					<span class="field-label">notes</span>
					<textarea bind:value={editNotes} rows={4}></textarea>
				</label>
				<div class="url-display">
					<span class="field-label">url</span>
					<a href={editingLink.url} target="_blank" rel="noopener noreferrer" class="url-link">{editingLink.url}</a>
				</div>
			</div>
			<div class="editor-footer">
				<button onclick={closeEdit} disabled={editSaving}>cancel</button>
				<button class="save-btn" onclick={saveEdit} disabled={editSaving}>
					{editSaving ? 'saving…' : 'save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── add overlay ───────────────────────────────────────────────────── -->
{#if addOpen}
	<div class="overlay-backdrop" role="presentation" onclick={() => addOpen = false}></div>
	<div class="editor" role="dialog" aria-modal="true">
		<div class="overlay-header">
			<span class="overlay-label">add link</span>
			<button class="close-btn" onclick={() => addOpen = false} aria-label="Close">×</button>
		</div>
		<div class="editor-body">
			<div class="editor-fields">
				<label class="field">
					<span class="field-label">url</span>
					<input type="text" bind:value={addUrl} placeholder="https://…" />
				</label>
				<label class="field">
					<span class="field-label">title</span>
					<input type="text" bind:value={addTitle} placeholder="Page title" />
				</label>
				<div class="field-row">
					<label class="field">
						<span class="field-label">category</span>
						<input type="text" bind:value={addCategory} />
					</label>
					<label class="field">
						<span class="field-label">tags (comma-separated)</span>
						<input type="text" bind:value={addTags} />
					</label>
				</div>
			</div>
			<div class="editor-footer">
				<button onclick={() => addOpen = false} disabled={addSaving}>cancel</button>
				<button class="save-btn" onclick={saveAdd} disabled={addSaving}>
					{addSaving ? 'saving…' : 'save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── main page ──────────────────────────────────────────────────────── -->
<div class="page">
	<div class="inner">
		<div class="search-area">
			<div class="search-row">
				<div class="search-bar" bind:this={searchBarEl}>
					{#if activeTag}
						<span class="tag-chip">
							{activeTag}
							<button class="chip-clear" onclick={clearTag} aria-label="clear filter">×</button>
						</span>
					{/if}
					<input
						type="text"
						class="search-input"
						class:with-chip={!!activeTag}
						placeholder={activeTag ? '' : 'search links, tags, or categories…'}
						bind:value={searchQuery}
						oninput={() => { suggestionsDismissed = false; if (searchQuery.trim()) activeTag = ''; }}
						aria-label="Search links"
						autocomplete="off"
						spellcheck="false"
					/>
					{#if showSuggestions}
						{#each tagSuggestions.slice(0, maxPills) as tag}
							<button class="pill" onclick={() => setTag(tag)}>{tag}</button>
						{/each}
						{#if tagSuggestions.length > maxPills}
							<span class="pill-more">+{tagSuggestions.length - maxPills}</span>
						{/if}
					{/if}
				</div>
				<div class="header-actions">
					{#if linksState.loaded}
						{#if selectMode}
							<button class="header-btn" onclick={deselectAll}>cancel</button>
						{:else}
							<button class="header-btn" onclick={() => selectMode = true}>select</button>
						{/if}
						<button class="header-btn" onclick={() => addOpen = true}>+ add</button>
					{/if}
				</div>
			</div>
		</div>

		{#if indexError}
			<p class="status error">{indexError}</p>
		{:else if !linksState.loaded}
			<p class="status">decrypting index…</p>
		{:else}

			<!-- bulk action bar -->
			{#if selectMode && selected.size > 0}
				<div class="bulk-bar">
					<span class="bulk-count">{selected.size} selected</span>
					<button class="bulk-btn" onclick={selectAll}>all</button>
					<button class="bulk-btn danger" onclick={bulkDelete} disabled={bulkSaving}>delete</button>
					<div class="bulk-input-group">
						<input type="text" bind:value={bulkCategoryTarget} placeholder="category" class="bulk-input" />
						<button class="bulk-btn" onclick={bulkRecategorize} disabled={bulkSaving || !bulkCategoryTarget}>apply</button>
					</div>
					<div class="bulk-input-group">
						<input type="text" bind:value={bulkTagInput} placeholder="tag" class="bulk-input" />
						<button class="bulk-btn" onclick={bulkAddTag} disabled={bulkSaving || !bulkTagInput}>+ tag</button>
					</div>
				</div>
			{/if}

			{#if grouped.length === 0}
				<p class="status">no matches.</p>
			{:else}
				{#each grouped as group (group.category)}
				<CategorySection
					category={group.category}
					links={group.links}
					{selectMode}
					selected={selected}
					confirmingId={confirmingId}
					deleteSaving={deleteSaving}
					isExpanded={shouldCategoryBeExpanded(group.category)}
					onToggleExpansion={() => toggleCategoryExpansion(group.category)}
					onSelect={toggleSelect}
					onEdit={startEdit}
					onDelete={(id) => confirmingId = id}
					onCancelDelete={() => confirmingId = null}
					onConfirmDelete={deleteLink}
					onTagClick={setTag}
					onCatRename={startRenameCategory}
					onCatDelete={(cat) => { catActionTarget = cat; catActionMode = 'delete'; }}
					onCatExport={exportCategory}
				/>
			{/each}

				<div class="footer-row">
					<p class="count">{filtered.length}{filtered.length !== linksState.entries.length ? ` of ${linksState.entries.length}` : ''} links</p>
					<div class="footer-actions">
						<button class="footer-btn" onclick={exportAll}>export all</button>
						{#if hasSources}
							<button class="footer-btn" onclick={stripSources} disabled={stripSaving}>
								{stripSaving ? '…' : 'strip sources'}
							</button>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

{:else}

<div class="page">
	<div class="inner">
		<div class="search-area">
			<h1 class="heading">links</h1>
		</div>
		<p class="status">private — admin access required.</p>
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
	.heading {
		font-family: var(--font-prose);
		font-size: 1rem; font-weight: normal;
		letter-spacing: 0.12em; color: var(--clr-text); margin: 0;
	}
	.status { font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text); }
	.status.error { color: var(--clr-danger); }
	.dim { font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.06em; color: var(--clr-text); }

	/* ── search area ─────────────────────────────────────────── */
	.search-area { margin-bottom: 2.5rem; }
	.search-row { display: flex; align-items: center; gap: 1rem; }
	.search-bar {
		display: flex; align-items: center; gap: 0.5rem;
		flex: 1;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
		overflow: hidden;
	}
	.search-input {
		background: none; border: none; outline: none; flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0;
		caret-color: currentColor;
	}
	.search-input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.tag-chip {
		display: inline-flex; align-items: center; gap: 0.4rem;
		background: rgba(0, 0, 0, 0.06);
		border: 1px solid var(--glass-border);
		border-radius: 2px; padding: 0.2rem 0.45rem 0.2rem 0.65rem;
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.1em;
		text-transform: uppercase; color: var(--clr-text); white-space: nowrap;
	}
	.chip-clear {
		background: none; border: none; cursor: pointer;
		color: var(--clr-text); opacity: 0.5; font-size: 0.85rem;
		padding: 0; line-height: 1; transition: opacity 0.15s;
	}
	.chip-clear:hover { opacity: 1; }
	.pill {
		background: none;
		border: 1px solid var(--glass-border);
		border-radius: 2px;
		padding: 0.25rem 0.65rem;
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.1em;
		text-transform: uppercase; color: var(--clr-text);
		cursor: pointer; transition: all 0.15s;
		white-space: nowrap; flex-shrink: 0;
	}
	.pill:hover { color: var(--clr-text); }
	.pill-more {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em;
		color: var(--clr-text); opacity: 0.5;
		white-space: nowrap; flex-shrink: 0;
	}

	.header-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
	.header-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s;
		white-space: nowrap;
	}
	.header-btn:hover { border-color: rgba(var(--ui-rgb), 0.45); }


	/* ── bulk bar ─────────────────────────────────────────── */
	.bulk-bar {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.5rem 0; margin-bottom: 0.8rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
		flex-wrap: wrap;
	}
	.bulk-count {
		font-family: var(--font-ui);
		font-size: 0.55rem; letter-spacing: 0.06em;
		color: var(--clr-text); opacity: 0.7;
	}
	.bulk-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.5rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.2rem 0.5rem; cursor: pointer;
		transition: all var(--t-ui);
	}
	.bulk-btn:hover:not(:disabled) { border-color: rgba(var(--ui-rgb), 0.45); }
	.bulk-btn.danger:hover:not(:disabled) { color: var(--clr-danger); border-color: var(--clr-danger-muted); }
	.bulk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.bulk-input-group { display: flex; gap: 0.25rem; align-items: center; }
	.bulk-input {
		background: none; border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem; letter-spacing: 0.04em;
		padding: 0.15rem 0.3rem; width: 6rem; outline: none;
	}
	.bulk-input:focus { border-color: rgba(var(--ui-rgb), 0.45); }

	/* ── footer ───────────────────────────────────────────── */
	.footer-row {
		display: flex; align-items: center; justify-content: space-between;
		margin-top: 2rem;
	}
	.count {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.1em; color: var(--clr-text);
		margin: 0;
	}
	.footer-actions { display: flex; gap: 0.4rem; }
	.footer-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.46rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.35;
		padding: 0.1rem 0.3rem; transition: opacity var(--t-ui);
	}
	.footer-btn:hover:not(:disabled) { opacity: 0.8; }
	.footer-btn:disabled { opacity: 0.2; cursor: not-allowed; }

	/* ── overlays shared ──────────────────────────────────── */
	.overlay-backdrop {
		position: fixed; inset: 0; z-index: 299;
		background: var(--backdrop-overlay);
	}
	.overlay-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1.2rem 2rem;
		border-bottom: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		flex-shrink: 0;
	}
	.editor-header-meta { display: flex; flex-direction: column; gap: 0.2rem; }
	.editor-url { font-size: 0.55rem; letter-spacing: 0.04em; color: var(--clr-dark-text); opacity: 0.5; }
	.overlay-label {
		font-family: var(--font-ui);
		font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--clr-dark-text);
	}
	.close-btn {
		background: none; border: none; color: var(--clr-dark-text);
		font-size: 1.4rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s;
	}
	.close-btn:hover { color: var(--clr-dark-text); }

	/* ── editor ───────────────────────────────────────────── */
	.editor {
		position: fixed; inset: 0; z-index: 300;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		display: flex; flex-direction: column; overflow: hidden;
	}
	.editor-body { flex: 1; overflow-y: auto; padding: 1.8rem 2rem; display: flex; flex-direction: column; gap: 1rem; }
	.editor-fields { display: flex; flex-direction: column; gap: 0.9rem; max-width: 860px; }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
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
	.editor-fields textarea { resize: vertical; line-height: 1.6; }
	.url-display { display: flex; flex-direction: column; gap: 0.3rem; }
	.url-link {
		font-family: var(--font-ui); font-size: 0.7rem;
		color: var(--clr-dark-text); opacity: 0.6;
		word-break: break-all; text-decoration: none;
	}
	.url-link:hover { opacity: 0.9; }
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
	.save-btn { background: rgba(var(--dark-panel-rgb),0.08) !important; border-color: rgba(var(--dark-panel-rgb),0.25) !important; }

	/* ── category edit modal (minimal style) ──────────────────────────── */
	.cat-edit-modal {
		position: fixed; top: 50%; left: 50%;
		transform: translate(-50%, -50%);
		z-index: 400;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid var(--glass-border-dark);
		padding: 1.5rem;
		width: min(380px, 90vw);
		display: flex; flex-direction: column; gap: 1rem;
	}
	.cat-edit-header {
		display: flex; align-items: center; justify-content: space-between;
	}
	.cat-edit-title {
		font-family: var(--font-ui);
		font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase;
		color: var(--clr-dark-text);
	}
	.cat-edit-input {
		background: rgba(var(--dark-panel-rgb), 0.06);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.18);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.85rem; padding: 0.45rem 0.6rem; outline: none;
		transition: border-color 0.15s; width: 100%;
	}
	.cat-edit-input:focus { border-color: rgba(var(--dark-panel-rgb), 0.38); }
	.cat-edit-actions {
		display: flex; gap: 0.5rem; justify-content: flex-end;
		padding-top: 0.5rem;
	}
	.cat-edit-btn {
		background: none; border: 1px solid rgba(var(--dark-panel-rgb), 0.20);
		color: var(--clr-dark-text); font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer; transition: all 0.15s;
	}
	.cat-edit-btn:hover:not(:disabled) { color: var(--clr-dark-text); border-color: rgba(var(--dark-panel-rgb), 0.40); }
	.cat-edit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.search-area { margin-bottom: 1.5rem; }
		.overlay-header { padding: 1rem 1.25rem; }
		.editor-body { padding: 1.25rem; }
		.field-row { grid-template-columns: 1fr; }
	}
</style>

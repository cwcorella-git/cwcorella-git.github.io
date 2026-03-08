<script lang="ts">
	import { adminState, writeQueue, linksState } from '$lib/admin/state.svelte';
	import { encryptDoc, decryptDoc } from '$lib/admin/crypto';
	import { toast } from '$lib/admin/toast.svelte';
	import type { LinkMeta } from '$lib/types';

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

	// ── search + filter + sort ────────────────────────────────────────────
	let searchQuery = $state('');
	let activeCategory = $state<string | null>(null);
	let activeTags = $state<Set<string>>(new Set());
	let sortBy = $state<'date' | 'alpha' | 'category'>('date');

	const categories = $derived(
		(() => {
			const counts: Record<string, number> = {};
			for (const l of linksState.entries) counts[l.category] = (counts[l.category] || 0) + 1;
			return Object.entries(counts)
				.filter(([cat, count]) => cat !== 'Uncategorized' || count > 0)
				.sort((a, b) => {
					// Uncategorized always last
					if (a[0] === 'Uncategorized') return 1;
					if (b[0] === 'Uncategorized') return -1;
					return b[1] - a[1];
				});
		})()
	);

	const allTags = $derived(
		(() => {
			const counts: Record<string, number> = {};
			for (const l of linksState.entries) for (const t of l.tags) counts[t] = (counts[t] || 0) + 1;
			return Object.entries(counts).sort((a, b) => b[1] - a[1]);
		})()
	);

	function matchesSearch(l: LinkMeta): boolean {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return true;
		return l.title.toLowerCase().includes(q)
			|| l.url.toLowerCase().includes(q)
			|| l.category.toLowerCase().includes(q)
			|| l.tags.some(t => t.includes(q))
			|| (l.notes?.toLowerCase().includes(q) ?? false);
	}

	function matchesFilters(l: LinkMeta): boolean {
		if (activeCategory && l.category !== activeCategory) return false;
		if (activeTags.size > 0 && !l.tags.some(t => activeTags.has(t))) return false;
		return true;
	}

	function sortFn(a: LinkMeta, b: LinkMeta): number {
		if (sortBy === 'alpha') return a.title.localeCompare(b.title);
		if (sortBy === 'category') return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
		return b.added.localeCompare(a.added); // date desc
	}

	let filtered = $derived(
		linksState.entries.filter(l => matchesSearch(l) && matchesFilters(l)).sort(sortFn)
	);

	function toggleCategory(cat: string) {
		activeCategory = activeCategory === cat ? null : cat;
	}

	function toggleTag(tag: string) {
		const next = new Set(activeTags);
		if (next.has(tag)) next.delete(tag); else next.add(tag);
		activeTags = next;
	}

	function clearFilters() {
		activeCategory = null;
		activeTags = new Set();
		searchQuery = '';
	}

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

	function closeEdit() {
		editingLink = null;
	}

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
				id,
				url,
				title: addTitle.trim() || url,
				category: addCategory.trim() || 'Personal',
				tags,
				added: new Date().toISOString().slice(0, 10),
			};
			await saveIndex([link, ...linksState.entries], `add link: ${link.title}`);
			addOpen = false;
			addUrl = '';
			addTitle = '';
			addCategory = 'Personal';
			addTags = '';
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			addSaving = false;
		}
	}

	// ── category operations ──────────────────────────────────────────────
	let renamingCategory = $state(false);
	let renameValue = $state('');
	let categorySaving = $state(false);
	let confirmDeleteCategory = $state(false);

	function startRenameCategory() {
		if (!activeCategory) return;
		renameValue = activeCategory;
		renamingCategory = true;
	}

	async function commitRenameCategory() {
		const oldName = activeCategory;
		const newName = renameValue.trim();
		if (!oldName || !newName || newName === oldName) { renamingCategory = false; return; }
		categorySaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				l.category === oldName ? { ...l, category: newName } : l
			);
			await saveIndex(newIndex, `rename category: ${oldName} → ${newName}`);
			activeCategory = newName;
			toast.success(`renamed "${oldName}" → "${newName}"`);
			renamingCategory = false;
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Rename failed.');
		} finally {
			categorySaving = false;
		}
	}

	async function deleteCategory() {
		if (!activeCategory) return;
		const cat = activeCategory;
		confirmDeleteCategory = false;
		categorySaving = true;
		try {
			const newIndex = linksState.entries.map(l =>
				l.category === cat ? { ...l, category: 'Uncategorized' } : l
			);
			await saveIndex(newIndex, `delete category: ${cat} → Uncategorized`);
			activeCategory = null;
			toast.success(`"${cat}" deleted — links moved to Uncategorized`);
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Delete failed.');
		} finally {
			categorySaving = false;
		}
	}

	function exportCategory(cat: string | null) {
		const links = cat
			? linksState.entries.filter(l => l.category === cat)
			: linksState.entries;
		const label = cat ?? 'all-links';

		const lines = [
			'<!DOCTYPE NETSCAPE-Bookmark-file-1>',
			'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
			`<TITLE>${label}</TITLE>`,
			`<H1>${label}</H1>`,
			'<DL><p>',
		];

		// Group by category if exporting all
		if (!cat) {
			const grouped: Record<string, LinkMeta[]> = {};
			for (const l of links) {
				(grouped[l.category] ??= []).push(l);
			}
			for (const [groupCat, groupLinks] of Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))) {
				lines.push(`    <DT><H3>${esc(groupCat)}</H3>`);
				lines.push('    <DL><p>');
				for (const l of groupLinks) {
					lines.push(`        <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor(new Date(l.added).getTime() / 1000)}">${esc(l.title)}</A>`);
				}
				lines.push('    </DL><p>');
			}
		} else {
			for (const l of links) {
				lines.push(`    <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor(new Date(l.added).getTime() / 1000)}">${esc(l.title)}</A>`);
			}
		}

		lines.push('</DL><p>');

		const blob = new Blob([lines.join('\n')], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${label.toLowerCase().replace(/\s+/g, '-')}.html`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success(`exported ${links.length} links`);
	}

	function exportJson(cat: string | null) {
		const links = cat
			? linksState.entries.filter(l => l.category === cat)
			: linksState.entries;
		const label = cat ?? 'all-links';

		const blob = new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${label.toLowerCase().replace(/\s+/g, '-')}.json`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success(`exported ${links.length} links as JSON`);
	}

	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	// ── strip source indicators ──────────────────────────────────────────
	let stripSaving = $state(false);

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

	const hasSources = $derived(linksState.entries.some(l => l.source));

	// ── keyboard ──────────────────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (renamingCategory) { renamingCategory = false; }
			else if (confirmDeleteCategory) { confirmDeleteCategory = false; }
			else if (editingLink) closeEdit();
			else if (addOpen) { addOpen = false; }
			else if (selectMode) deselectAll();
			else { confirmingId = null; }
		}
	}

	// ── helpers ───────────────────────────────────────────────────────────
	function domain(url: string): string {
		try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
	}
</script>

<svelte:head><title>cwcorella</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

{#if adminState.active}

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
		<div class="page-header">
			<div class="search-bar">
				<input
					type="text"
					class="search-input"
					placeholder="search links…"
					bind:value={searchQuery}
					autocomplete="off"
					spellcheck="false"
					aria-label="Search links"
					onkeydown={(e) => { if (e.key === 'Escape') { searchQuery = ''; (e.target as HTMLInputElement).blur(); } }}
				/>
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

		{#if indexError}
			<p class="status error">{indexError}</p>
		{:else if !linksState.loaded}
			<p class="status">decrypting index…</p>
		{:else}
			<!-- category pills -->
			{#if categories.length > 0}
				<div class="pills">
					{#each categories as [cat, count]}
						<button
							class="pill"
							class:active={activeCategory === cat}
							onclick={() => toggleCategory(cat)}
						>{cat} <span class="pill-count">{count}</span></button>
					{/each}
				</div>
			{/if}

			<!-- category actions (when one is selected) -->
			{#if activeCategory}
				<div class="cat-actions">
					{#if renamingCategory}
						<input
							type="text"
							class="cat-rename-input"
							bind:value={renameValue}
							onkeydown={(e) => { if (e.key === 'Enter') commitRenameCategory(); if (e.key === 'Escape') renamingCategory = false; }}
						/>
						<button class="cat-action-btn" onclick={commitRenameCategory} disabled={categorySaving}>
							{categorySaving ? '…' : 'save'}
						</button>
						<button class="cat-action-btn" onclick={() => renamingCategory = false}>cancel</button>
					{:else if confirmDeleteCategory}
						<span class="dim">delete "{activeCategory}"? links move to Uncategorized.</span>
						<button class="cat-action-btn danger" onclick={deleteCategory} disabled={categorySaving}>
							{categorySaving ? '…' : 'confirm'}
						</button>
						<button class="cat-action-btn" onclick={() => confirmDeleteCategory = false}>cancel</button>
					{:else}
						<button class="cat-action-btn" onclick={startRenameCategory}>rename</button>
						<button class="cat-action-btn danger" onclick={() => confirmDeleteCategory = true}>delete</button>
						<button class="cat-action-btn" onclick={() => exportCategory(activeCategory)}>export html</button>
						<button class="cat-action-btn" onclick={() => exportJson(activeCategory)}>export json</button>
					{/if}
				</div>
			{/if}

			<!-- tag pills (show top tags, expandable) -->
			{#if allTags.length > 0}
				<div class="pills tags-row">
					{#each allTags.slice(0, 20) as [tag, count]}
						<button
							class="pill tag-pill"
							class:active={activeTags.has(tag)}
							onclick={() => toggleTag(tag)}
						>{tag} <span class="pill-count">{count}</span></button>
					{/each}
				</div>
			{/if}

			<!-- sort + meta row -->
			<div class="meta-row">
				<div class="sort-controls">
					<button class="sort-btn" class:active={sortBy === 'date'} onclick={() => sortBy = 'date'}>date</button>
					<button class="sort-btn" class:active={sortBy === 'alpha'} onclick={() => sortBy = 'alpha'}>a–z</button>
					<button class="sort-btn" class:active={sortBy === 'category'} onclick={() => sortBy = 'category'}>category</button>
				</div>
				{#if activeCategory || activeTags.size > 0 || searchQuery.trim()}
					<button class="clear-btn" onclick={clearFilters}>clear filters</button>
				{/if}
				{#if !activeCategory}
					<button class="meta-btn" onclick={() => exportCategory(null)}>export all</button>
				{/if}
				{#if hasSources}
					<button class="strip-btn" onclick={stripSources} disabled={stripSaving}>
						{stripSaving ? '…' : 'strip sources'}
					</button>
				{/if}
			</div>

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

			{#if filtered.length === 0}
				<p class="status">no matches.</p>
			{:else}
				<ul class="list">
					{#each filtered as link (link.id)}
						<li>
							{#if confirmingId === link.id}
								<div class="entry-row confirm-row">
									<span class="dim">delete "{link.title}"?</span>
									<div class="row-actions">
										<button class="action-btn danger" onclick={() => deleteLink(link.id)} disabled={deleteSaving}>
											{deleteSaving ? '…' : 'confirm'}
										</button>
										<button class="action-btn" onclick={() => confirmingId = null}>cancel</button>
									</div>
								</div>
							{:else}
								<div class="entry-row">
									{#if selectMode}
										<input
											type="checkbox"
											class="select-check"
											checked={selected.has(link.id)}
											onchange={() => toggleSelect(link.id)}
										/>
									{/if}
									<a class="entry-link" href={link.url} target="_blank" rel="noopener noreferrer">
										{#if link.source}<span class="source-indicator">{link.source}</span>{/if}
										<span class="entry-title">{link.title}</span>
										<span class="entry-domain">{domain(link.url)}</span>
									</a>
									<span class="entry-category">{link.category}</span>
									{#if link.tags.length > 0}
										<span class="entry-tags">
											{#each link.tags.slice(0, 3) as tag}
												<span class="entry-tag">{tag}</span>
											{/each}
											{#if link.tags.length > 3}
												<span class="entry-tag dim">+{link.tags.length - 3}</span>
											{/if}
										</span>
									{/if}
									<div class="row-actions">
										<button class="action-btn" onclick={() => startEdit(link)}>edit</button>
										<button class="action-btn danger" onclick={() => confirmingId = link.id}>×</button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="count">{filtered.length}{filtered.length !== linksState.entries.length ? ` of ${linksState.entries.length}` : ''} links</p>
			{/if}
		{/if}
	</div>
</div>

{:else}

<div class="page">
	<div class="inner">
		<div class="page-header">
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
	.page-header {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2.5rem;
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

	.header-actions { display: flex; gap: 0.5rem; }
	.header-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
		padding: 0.3rem 0.75rem; cursor: pointer; transition: all 0.15s;
	}
	.header-btn:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	.status { font-family: var(--font-ui); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--clr-text); }
	.status.error { color: var(--clr-danger); }
	.dim { font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.06em; color: var(--clr-text); }

	/* ── pills ────────────────────────────────────────────── */
	.pills {
		display: flex; flex-wrap: wrap; gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.tags-row { margin-bottom: 1rem; }
	.pill {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.20);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem; letter-spacing: 0.06em;
		padding: 0.2rem 0.5rem; cursor: pointer;
		transition: all var(--t-ui); opacity: 0.65;
	}
	.pill:hover { opacity: 1; border-color: rgba(var(--ui-rgb), 0.40); }
	.pill.active {
		opacity: 1;
		border-color: rgba(var(--ui-rgb), 0.50);
		background: rgba(var(--ui-rgb), 0.10);
	}
	.pill-count { opacity: 0.5; margin-left: 0.15rem; }
	.tag-pill { font-size: 0.5rem; padding: 0.15rem 0.4rem; }

	/* ── category actions ─────────────────────────────────── */
	.cat-actions {
		display: flex; align-items: center; gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.cat-action-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.48rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.5;
		padding: 0.15rem 0.3rem; transition: opacity var(--t-ui);
	}
	.cat-action-btn:hover:not(:disabled) { opacity: 1; }
	.cat-action-btn.danger:hover:not(:disabled) { color: var(--clr-danger); opacity: 1; }
	.cat-action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.cat-rename-input {
		background: none; border: none;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.30);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em;
		padding: 0.15rem 0.3rem; width: 10rem; outline: none;
	}
	.cat-rename-input:focus { border-color: rgba(var(--ui-rgb), 0.55); }

	/* ── meta row ─────────────────────────────────────────── */
	.meta-row {
		display: flex; align-items: center; gap: 0.75rem;
		margin-bottom: 1.2rem;
		flex-wrap: wrap;
	}
	.sort-controls { display: flex; gap: 0.3rem; }
	.sort-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.5rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.45; padding: 0.15rem 0.3rem;
		transition: opacity var(--t-ui);
	}
	.sort-btn:hover { opacity: 0.8; }
	.sort-btn.active { opacity: 1; }
	.clear-btn, .strip-btn, .meta-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.48rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.45; padding: 0.15rem 0.3rem;
		transition: opacity var(--t-ui); margin-left: auto;
	}
	.clear-btn:hover, .strip-btn:hover, .meta-btn:hover { opacity: 0.8; }
	.strip-btn { opacity: 0.35; }

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

	/* ── list ─────────────────────────────────────────────── */
	.list { list-style: none; margin: 0; padding: 0; }

	.entry-row {
		display: flex; align-items: center; gap: 0.6rem;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
		padding: 0.6rem 0;
	}
	.confirm-row { gap: 1.5rem; }

	.select-check {
		accent-color: var(--clr-text);
		width: 0.75rem; height: 0.75rem; flex-shrink: 0;
		cursor: pointer;
	}

	.entry-link {
		flex: 1; min-width: 0;
		text-decoration: none;
		display: flex; flex-direction: column; gap: 0.1rem;
		transition: opacity var(--t-ui);
	}
	.entry-link:hover .entry-title { opacity: 1; }

	.source-indicator {
		font-size: 0.55rem; opacity: 0.4;
		margin-right: 0.15rem;
		display: inline;
	}

	.entry-title {
		font-family: var(--font-prose);
		font-size: 0.85rem; color: var(--clr-text); line-height: 1.3;
		opacity: 0.85;
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.entry-domain {
		font-family: var(--font-ui);
		font-size: 0.52rem; letter-spacing: 0.04em;
		color: var(--clr-text); opacity: 0.4;
	}

	.entry-category {
		font-family: var(--font-ui);
		font-size: 0.48rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.5;
		white-space: nowrap; flex-shrink: 0;
	}

	.entry-tags {
		display: flex; gap: 0.2rem; flex-shrink: 0;
	}
	.entry-tag {
		font-family: var(--font-ui);
		font-size: 0.42rem; letter-spacing: 0.04em;
		color: var(--clr-text); opacity: 0.4;
		border: 1px solid rgba(var(--ui-rgb), 0.15);
		padding: 0.05rem 0.25rem;
	}

	.row-actions {
		display: flex; gap: 0.5rem; flex-shrink: 0; margin-left: auto;
	}

	.action-btn {
		background: none; border: none; cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.52rem; letter-spacing: 0.08em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.45; padding: 0 0.3rem; transition: all 0.15s;
	}
	.action-btn:hover:not(:disabled) { opacity: 1; }
	.action-btn.danger:hover:not(:disabled) { color: var(--clr-danger); opacity: 1; }
	.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }

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
	.url-display {
		display: flex; flex-direction: column; gap: 0.3rem;
	}
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

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.overlay-header { padding: 1rem 1.25rem; }
		.editor-body { padding: 1.25rem; }
		.field-row { grid-template-columns: 1fr; }
		.entry-category, .entry-tags { display: none; }
	}
</style>

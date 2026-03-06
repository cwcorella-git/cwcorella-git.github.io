<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { Book } from '$lib/types';
	import allBooksStatic from '$lib/books.json';
	import { adminState, bookFormState, booksState } from '$lib/admin/state.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import DocReader from '$lib/components/DocReader.svelte';

	// Derive from shared booksState so BookForm updates are visible here
	let books = $derived(booksState.books);

	// ── categories ──────────────────────────────────────────────
	const countMap: Record<string, number> = {};
	(allBooksStatic as Book[]).forEach((b) => { countMap[b.category] = (countMap[b.category] || 0) + 1; });
	const categories = Object.entries(countMap)
		.sort((a, b) => b[1] - a[1])
		.map(([c]) => c);

	// ── search / filter state ────────────────────────────────────
	let searchQuery = $state('');
	let activeTag = $state('');
	let suggestionsDismissed = $state(false);

	let tagSuggestions = $derived(
		(searchQuery.trim() && !activeTag)
			? categories.filter((c) => c.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 6)
			: []
	);

	let showSuggestions = $derived(tagSuggestions.length > 0 && !suggestionsDismissed);

	let filtered = $derived(
		activeTag
			? books.filter((b) => b.category === activeTag)
			: searchQuery.trim()
				? books.filter(
						(b) =>
							b.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
							b.author.toLowerCase().includes(searchQuery.trim().toLowerCase())
					)
				: books
	);

	function setTag(cat: string) { activeTag = cat; searchQuery = ''; }
	function clearTag() { activeTag = ''; }
	function clearAll() { activeTag = ''; searchQuery = ''; }

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') { clearAll(); closeMenu(); }
		if (e.key === 'Enter') { suggestionsDismissed = true; }
	}

	// ── completed state (localStorage) ──────────────────────────
	let completed = $state(new Set<number>());
	onMount(() => {
		if (browser) {
			completed = new Set(JSON.parse(localStorage.getItem('cwc-read') || '[]'));
		}
	});

	function toggleRead(id: number) {
		const next = new Set(completed);
		if (next.has(id)) next.delete(id); else next.add(id);
		completed = next;
		if (browser) localStorage.setItem('cwc-read', JSON.stringify([...next]));
	}

	// ── context menu ─────────────────────────────────────────────
	let menu = $state<{ book: Book; x: number; y: number } | null>(null);

	function openMenu(e: MouseEvent, book: Book) {
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		menu = { book, x: rect.left, y: rect.bottom + window.scrollY + 4 };
	}

	function closeMenu() { menu = null; }

	function goodreadsUrl(book: Book) {
		const q = encodeURIComponent(`${book.title} ${book.author}`.trim());
		return `https://www.goodreads.com/search?q=${q}`;
	}

	function hasLinks(book: Book) {
		return book.links && book.links.length > 0;
	}

	// ── doc reader ───────────────────────────────────────────────
	let docReaderBook = $state<Book | null>(null);

	function handleRowClick(book: Book) {
		if (book.doc?.visibility === 'admin' && !adminState.active) {
			toast.error('no source available');
			return;
		}
		docReaderBook = book;
	}

</script>

<svelte:head>
	<title>reading — cwcorella</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- DocReader overlay -->
{#if docReaderBook}
	<DocReader book={docReaderBook} onClose={() => (docReaderBook = null)} />
{/if}

<!-- Context menu -->
{#if menu}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="menu" style="top:{menu.y}px; left:{menu.x}px" role="dialog">
		{#if hasLinks(menu.book)}
			{#each menu.book.links! as link}
				<a href={link.url} target="_blank" rel="noopener noreferrer">{link.name} ↗</a>
			{/each}
		{:else}
			<a href={goodreadsUrl(menu.book)} target="_blank" rel="noopener noreferrer">Goodreads ↗</a>
		{/if}
	</div>
	<div
		class="menu-backdrop"
		role="presentation"
		onclick={closeMenu}
		onkeydown={undefined}
	></div>
{/if}

<div class="page" role="main" oncontextmenu={(e) => e.preventDefault()}>
	<div class="glow" aria-hidden="true"></div>

	<div class="inner">
		<div class="search-area">
			<div class="search-bar">
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
					placeholder={activeTag ? '' : 'search titles, authors, or categories…'}
					bind:value={searchQuery}
					oninput={() => { suggestionsDismissed = false; if (searchQuery.trim()) activeTag = ''; }}
					aria-label="Search books"
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			{#if showSuggestions}
				<div class="suggestions">
					{#each tagSuggestions as cat}
						<button class="pill" onclick={() => setTag(cat)}>{cat}</button>
					{/each}
				</div>
			{/if}
		</div>

		<ul class="list">
			{#each filtered as book (book.id)}
				<li class:done={completed.has(book.id)}>
					<div class="row-wrap">
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							class="row"
							role="button"
							tabindex="0"
							onclick={() => handleRowClick(book)}
							oncontextmenu={(e) => openMenu(e, book)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(book); }}
						>
							<span class="title">{book.title}</span>
							<span class="meta">{book.author}{book.year ? ` · ${book.year}` : ''}</span>
						</div>
						<button
							class="read-toggle"
							class:is-read={completed.has(book.id)}
							onclick={() => toggleRead(book.id)}
							aria-label={completed.has(book.id) ? 'Mark as unread' : 'Mark as read'}
						>✓</button>
						{#if adminState.editMode}
							<button
								class="edit-pencil"
								onclick={() => bookFormState.openEdit(book)}
								aria-label="Edit {book.title}"
							>✎</button>
						{/if}
						<button
							class="cat-label"
							class:active-cat={activeTag === book.category}
							onclick={() => setTag(book.category)}
						>
							{book.category}
						</button>
					</div>
				</li>
			{/each}
		</ul>

		<p class="count">{filtered.length} titles</p>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		padding-top: 4rem;
		background-image:
			linear-gradient(rgba(200, 150, 60, 0.016) 1px, transparent 1px),
			linear-gradient(90deg, rgba(200, 150, 60, 0.016) 1px, transparent 1px);
		background-size: 48px 48px;
	}

	.glow {
		position: fixed;
		top: 30%; left: 60%;
		width: 600px; height: 600px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(200, 120, 40, 0.05) 0%, transparent 65%);
		pointer-events: none;
		z-index: 0;
	}

	.inner {
		position: relative;
		z-index: 1;
		max-width: 760px;
		margin: 0 auto;
		padding: 3rem 2rem 6rem;
	}

	/* ── search area ─────────────────────────────────────────── */
	.search-area { margin-bottom: 2rem; }

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid rgba(200, 150, 60, 0.22);
		padding-bottom: 0.4rem;
	}

	.search-input {
		background: none; border: none; outline: none; flex: 1;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.78rem; letter-spacing: 0.06em;
		color: #c0b088; padding: 0.3rem 0;
		caret-color: #c8a060;
	}
	.search-input::placeholder { color: #4e4232; }

	.tag-chip {
		display: inline-flex; align-items: center; gap: 0.4rem;
		background: rgba(200, 150, 60, 0.08);
		border: 1px solid rgba(200, 150, 60, 0.35);
		border-radius: 2px; padding: 0.2rem 0.45rem 0.2rem 0.65rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem; letter-spacing: 0.1em;
		text-transform: uppercase; color: #c8a060; white-space: nowrap;
	}
	.chip-clear {
		background: none; border: none; cursor: pointer;
		color: #c8a060; opacity: 0.5; font-size: 0.85rem;
		padding: 0; line-height: 1; transition: opacity 0.15s;
	}
	.chip-clear:hover { opacity: 1; }

	.suggestions {
		display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.6rem;
	}

	/* ── pills ───────────────────────────────────────────────── */
	.pill {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.18);
		border-radius: 2px;
		padding: 0.25rem 0.65rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7a6a48;
		cursor: pointer;
		transition: all 0.15s;
	}
	.pill:hover { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }

	/* ── list ────────────────────────────────────────────────── */
	.list {
		list-style: none;
		margin: 0; padding: 0;
	}
	li { border-bottom: none; }
	li.done .row-wrap {
		background: rgba(200, 150, 60, 0.055);
		border-left: 2px solid rgba(200, 150, 60, 0.28);
		padding-left: 0.75rem;
	}
	li.done .title {
		color: #d4b878;
	}
	li.done .title::after {
		content: ' ✓';
		font-size: 0.7em;
		color: #c8a060;
		opacity: 0.7;
	}
	li.done .meta {
		color: #7a6a50;
	}
	li.done .cat-label {
		color: #6a5a3a;
	}

	.row-wrap {
		display: flex; align-items: center;
		border-bottom: 1px solid rgba(200, 150, 60, 0.09);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		padding: 0.85rem 0;
		cursor: pointer;
		transition: background 0.15s;
	}
	.row:hover { background: rgba(200, 150, 60, 0.03); }

	.title {
		font-size: 0.95rem;
		color: #c0b088;
		line-height: 1.4;
	}
	.meta {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: #6a5a40;
	}

	.read-toggle {
		background: none;
		border: none;
		cursor: pointer;
		color: #2e2820;
		font-size: 0.85rem;
		padding: 0 0.4rem;
		transition: color 0.15s;
		flex-shrink: 0;
	}
	.read-toggle:hover { color: #7a6a48; }
	.read-toggle.is-read { color: #c8a060; }

	.edit-pencil {
		background: none;
		border: none;
		cursor: pointer;
		color: #6a5a40;
		font-size: 0.85rem;
		padding: 0 0.5rem;
		transition: color 0.15s;
		flex-shrink: 0;
	}
	.edit-pencil:hover { color: #c8a060; }

	.cat-label {
		background: none; border: none; cursor: pointer;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.55rem; letter-spacing: 0.08em;
		text-transform: uppercase; color: #4e4232;
		padding: 0 0 0 1rem; white-space: nowrap;
		flex-shrink: 0; text-align: right; transition: color 0.15s;
	}
	.cat-label:hover { color: #9a8a68; }
	.cat-label.active-cat { color: #c8a060; }

	.count {
		margin-top: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: #5a4e38;
	}

	/* ── context menu ────────────────────────────────────────── */
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 199;
	}
	.menu {
		position: absolute;
		z-index: 200;
		background: #120e04;
		border: 1px solid rgba(200, 150, 60, 0.25);
		padding: 0.3rem 0;
		min-width: 180px;
		display: flex;
		flex-direction: column;
	}
	.menu a,
	.menu-toggle {
		display: block;
		padding: 0.55rem 1rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		color: #8a7858;
		text-decoration: none;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
		width: 100%;
	}
	.menu a:hover {
		color: #c8a060;
		background: rgba(200, 150, 60, 0.07);
	}
</style>

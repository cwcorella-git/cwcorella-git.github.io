<script lang="ts">
	import type { Book } from '$lib/types';
	import allBooksStatic from '$lib/books.json';
	import { adminState, bookFormState, booksState, writeQueue } from '$lib/admin/state.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import BookView from '$lib/components/BookView.svelte';

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

	// ── search bar sizing ────────────────────────────────────────
	let searchBarEl = $state<HTMLElement | undefined>();
	let searchBarWidth = $state(0);
	$effect(() => {
		if (!searchBarEl) return;
		const ro = new ResizeObserver(([e]) => { searchBarWidth = e.contentRect.width; });
		ro.observe(searchBarEl);
		return () => ro.disconnect();
	});
	// Courier New is monospace: ~7px/char at 0.62rem + 0.1em letter-spacing
	// Pill overhead: 2×0.65rem padding + border ≈ 24px. Gap: 0.5rem ≈ 8px.
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

	// ── read state (stored in books.json, admin-only toggle) ─────
	function toggleRead(book: Book) {
		const updated = booksState.books.map(b =>
			b.id === book.id ? { ...b, read: !b.read || undefined } : b
		);
		booksState.set(updated);
		writeQueue.push({ domain: 'books', books: updated });
	}

	// ── context menu ─────────────────────────────────────────────
	let menu = $state<{ book: Book; x: number; y: number } | null>(null);

	function openMenu(e: MouseEvent, book: Book) {
		e.preventDefault();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const menuWidth = 200;
		const x = Math.min(rect.left, window.innerWidth - menuWidth - 8);
		menu = { book, x, y: rect.bottom + 4 };
	}

	function closeMenu() { menu = null; }

	function goodreadsUrl(book: Book) {
		const q = encodeURIComponent(`${book.title} ${book.author}`.trim());
		return `https://www.goodreads.com/search?q=${q}`;
	}

	function hasLinks(book: Book) {
		return book.links && book.links.length > 0;
	}

	// ── book view ────────────────────────────────────────────────
	let bookViewBook = $state<Book | null>(null);

	function handleRowClick(book: Book) {
		if (book.doc?.visibility === 'admin' && !adminState.active) {
			toast.error('no source available');
			return;
		}
		bookViewBook = book;
	}

	function handleBookSaved(updatedBooks: Book[]) {
		// Keep bookViewBook in sync with the updated book entry so the
		// header/fields reflect the save without having to re-open.
		if (bookViewBook) {
			const updated = updatedBooks.find(b => b.id === bookViewBook!.id);
			if (updated) bookViewBook = updated;
		}
	}

</script>

<svelte:head>
	<title>cwcorella</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- BookView overlay -->
{#if bookViewBook}
	<BookView
		book={bookViewBook}
		onClose={() => (bookViewBook = null)}
		onSaved={handleBookSaved}
	/>
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
						placeholder={activeTag ? '' : 'search titles, authors, or categories…'}
						bind:value={searchQuery}
						oninput={() => { suggestionsDismissed = false; if (searchQuery.trim()) activeTag = ''; }}
						aria-label="Search books"
						autocomplete="off"
						spellcheck="false"
					/>
					{#if showSuggestions}
						{#each tagSuggestions.slice(0, maxPills) as cat}
							<button class="pill" onclick={() => setTag(cat)}>{cat}</button>
						{/each}
						{#if tagSuggestions.length > maxPills}
							<span class="pill-more">+{tagSuggestions.length - maxPills}</span>
						{/if}
					{/if}
				</div>
				{#if adminState.active}
					<button class="add-btn" onclick={() => bookFormState.openAdd()}>+ add</button>
				{/if}
			</div>
		</div>

		<ul class="list">
			{#each filtered as book (book.id)}
				<li class:done={book.read}>
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
						{#if adminState.active}
							<button
								class="read-toggle"
								class:is-read={book.read}
								onclick={() => toggleRead(book)}
								aria-label={book.read ? 'Mark as unread' : 'Mark as read'}
							>{book.read ? 'unmark' : 'mark read'}</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		<p class="count">{filtered.length} {filtered.length === 1 ? 'title' : 'titles'}</p>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		padding-top: 4rem;
	}

	/* ── search area ─────────────────────────────────────────── */
	.search-area { margin-bottom: 2.5rem; }

	.inner {
		position: relative;
		z-index: 1;
		max-width: 760px;
		margin: 0 auto;
		padding: 3rem 2rem 6rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		will-change: background, border-color;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.add-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.add-btn:hover { color: var(--clr-text); border-color: rgba(var(--ui-rgb), 0.45); }

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
		overflow: hidden;
	}
	.pill-more {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em;
		color: var(--clr-text); opacity: 0.5;
		white-space: nowrap; flex-shrink: 0;
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


	/* ── pills ───────────────────────────────────────────────── */
	.pill {
		background: none;
		border: 1px solid var(--glass-border);
		border-radius: 2px;
		padding: 0.25rem 0.65rem;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--clr-text);
		cursor: pointer;
		transition: all 0.15s;
	}
	.pill:hover { color: var(--clr-text); }

	/* ── list ────────────────────────────────────────────────── */
	.list {
		list-style: none;
		margin: 0; padding: 0;
	}
	li { border-bottom: none; }
	li.done .row-wrap {
		background: rgba(var(--ui-rgb), 0.06);
		border-left: 2px solid rgba(var(--ui-rgb), 0.50);
		padding-left: 0.75rem;
	}
	li.done .title {
		color: var(--clr-text);
	}
	li.done .title::after {
		content: ' ✓';
		font-size: 0.7em;
		color: var(--clr-text);
		opacity: 0.9;
	}
	li.done .meta {
		color: var(--clr-text);
	}

	.row-wrap {
		display: flex; align-items: center;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.16);
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
	.row:hover { background: rgba(var(--ui-rgb), 0.03); }

	.title {
		font-family: var(--font-prose);
		font-size: 0.95rem;
		color: var(--clr-text);
		line-height: 1.4;
	}
	.meta {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
	}

	.read-toggle {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-text);
		padding: 0 0.6rem;
		transition: color 0.15s;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.read-toggle:hover:not(:disabled) { color: var(--clr-text); }
	.read-toggle.is-read { color: var(--clr-text); }
	.read-toggle:disabled { opacity: 0.4; cursor: not-allowed; }

	.count {
		margin-top: 2rem;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: var(--clr-text);
	}

	/* ── context menu ────────────────────────────────────────── */
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 199;
	}
	.menu {
		position: fixed;
		z-index: 200;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 0.3rem 0;
		min-width: 180px;
		display: flex;
		flex-direction: column;
	}
	.menu a {
		display: block;
		padding: 0.55rem 1rem;
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		color: var(--clr-dark-text);
		text-decoration: none;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
		width: 100%;
	}
	.menu a:hover {
		color: var(--clr-dark-text);
		background: rgba(var(--dark-panel-rgb), 0.06);
	}

	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.search-area { margin-bottom: 1.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.read-toggle {
			padding: 0.5rem 0.4rem;
			min-height: 44px;
			display: inline-flex;
			align-items: center;
		}
	}
</style>

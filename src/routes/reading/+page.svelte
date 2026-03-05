<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import allBooks from '$lib/books.json';

	// ── categories ──────────────────────────────────────────────
	const countMap = {};
	allBooks.forEach((b) => { countMap[b.category] = (countMap[b.category] || 0) + 1; });
	const categories = Object.entries(countMap)
		.sort((a, b) => b[1] - a[1])
		.map(([c]) => c);

	// ── search / filter state ────────────────────────────────────
	let searchQuery = '';
	let activeTag = '';
	let suggestionsDismissed = false;

	$: tagSuggestions = (searchQuery.trim() && !activeTag)
		? categories.filter(c => c.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 6)
		: [];

	$: showSuggestions = tagSuggestions.length > 0 && !suggestionsDismissed;

	$: filtered = activeTag
		? allBooks.filter(b => b.category === activeTag)
		: searchQuery.trim()
			? allBooks.filter(b =>
					b.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
					b.author.toLowerCase().includes(searchQuery.trim().toLowerCase())
				)
			: allBooks;

	function setTag(cat) { activeTag = cat; searchQuery = ''; }
	function clearTag()  { activeTag = ''; }
	function clearAll()  { activeTag = ''; searchQuery = ''; }

	function handleKeydown(e) {
		if (e.key === 'Escape') { clearAll(); closeMenu(); }
		if (e.key === 'Enter')  { suggestionsDismissed = true; }
	}

	// ── completed state (localStorage) ──────────────────────────
	let completed = new Set();
	onMount(() => {
		if (browser) {
			completed = new Set(JSON.parse(localStorage.getItem('cwc-read') || '[]'));
		}
	});

	function toggleRead(id) {
		if (completed.has(id)) {
			completed.delete(id);
		} else {
			completed.add(id);
		}
		completed = new Set(completed);
		if (browser) localStorage.setItem('cwc-read', JSON.stringify([...completed]));
		menu = null;
	}

	// ── context menu ─────────────────────────────────────────────
	let menu = null; // { book, x, y }

	function openMenu(e, book) {
		const rect = e.currentTarget.getBoundingClientRect();
		menu = { book, x: rect.left, y: rect.bottom + window.scrollY + 4 };
	}

	function closeMenu() { menu = null; }

	function link(type, book) {
		const q = encodeURIComponent(`${book.title} ${book.author}`.trim());
		const t = encodeURIComponent(book.title);
		return {
			anna:        `https://annas-archive.org/search?q=${q}`,
			openlibrary: `https://openlibrary.org/search?q=${q}`,
			worldcat:    `https://search.worldcat.org/search?q=${t}`,
		}[type];
	}
</script>

<svelte:head>
	<title>reading — cwcorella</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_noninteractive_element_interactions -->
{#if menu}
	<div class="menu" style="top:{menu.y}px; left:{menu.x}px" role="dialog">
		<button class="menu-toggle" on:click={() => toggleRead(menu.book.id)}>
			{completed.has(menu.book.id) ? '✓ mark unread' : 'mark as read'}
		</button>
		<div class="menu-divider"></div>
		<a href={link('anna', menu.book)} target="_blank" rel="noopener noreferrer">Anna's Archive ↗</a>
		<a href={link('openlibrary', menu.book)} target="_blank" rel="noopener noreferrer">Open Library ↗</a>
		<a href={link('worldcat', menu.book)} target="_blank" rel="noopener noreferrer">WorldCat ↗</a>
	</div>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="menu-backdrop" on:click={closeMenu}></div>
{/if}

<div class="page">
	<div class="glow" aria-hidden="true"></div>

	<div class="inner">
		<div class="search-area">
			<div class="search-bar">
				{#if activeTag}
					<span class="tag-chip">
						{activeTag}
						<button class="chip-clear" on:click={clearTag} aria-label="clear filter">×</button>
					</span>
				{/if}
				<input
					type="text"
					class="search-input"
					class:with-chip={!!activeTag}
					placeholder={activeTag ? '' : 'search titles, authors, or categories…'}
					bind:value={searchQuery}
					on:input={() => { suggestionsDismissed = false; if (searchQuery.trim()) activeTag = ''; }}
					aria-label="Search books"
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			{#if showSuggestions}
				<div class="suggestions">
					{#each tagSuggestions as cat}
						<button class="pill" on:click={() => setTag(cat)}>{cat}</button>
					{/each}
				</div>
			{/if}
		</div>

		<ul class="list">
			{#each filtered as book (book.id)}
				<li class:done={completed.has(book.id)}>
					<div class="row-wrap">
						<button class="row" on:click={(e) => openMenu(e, book)}>
							<span class="title">{book.title}</span>
							<span class="meta">{book.author}{book.year ? ` · ${book.year}` : ''}</span>
						</button>
						<button
							class="cat-label"
							class:active-cat={activeTag === book.category}
							on:click={() => setTag(book.category)}
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
		border-bottom: 1px solid rgba(200, 150, 60, 0.15);
		padding-bottom: 0.4rem;
	}

	.search-input {
		background: none; border: none; outline: none; flex: 1;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.78rem; letter-spacing: 0.06em;
		color: #8a7a58; padding: 0.3rem 0;
		caret-color: #c8a060;
	}
	.search-input::placeholder { color: #2a2010; }

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

	/* ── pills (reused for suggestions) ─────────────────────── */
	.pill {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.12);
		border-radius: 2px;
		padding: 0.25rem 0.65rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #4a3e26;
		cursor: pointer;
		transition: all 0.15s;
	}
	.pill:hover { color: #9a8060; border-color: rgba(200, 150, 60, 0.3); }

	/* ── list ────────────────────────────────────────────────── */
	.list {
		list-style: none;
		margin: 0; padding: 0;
	}
	li { border-bottom: none; }
	li.done .title {
		color: #c8a060;
	}
	li.done .title::after {
		content: ' ✓';
		font-size: 0.7em;
		color: #c8a060;
		opacity: 0.6;
	}

	.row-wrap {
		display: flex; align-items: center;
		border-bottom: 1px solid rgba(200, 150, 60, 0.05);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		background: none;
		border: none;
		padding: 0.85rem 0;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
	}
	.row:hover { background: rgba(200, 150, 60, 0.03); }

	.title {
		font-size: 0.95rem;
		color: #8a7a58;
		line-height: 1.4;
	}
	.meta {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: #3a3020;
	}

	.cat-label {
		background: none; border: none; cursor: pointer;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.55rem; letter-spacing: 0.08em;
		text-transform: uppercase; color: #2a2010;
		padding: 0 0 0 1rem; white-space: nowrap;
		flex-shrink: 0; text-align: right; transition: color 0.15s;
	}
	.cat-label:hover { color: #4a3e26; }
	.cat-label.active-cat { color: #c8a060; }

	.count {
		margin-top: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: #2a2010;
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
		border: 1px solid rgba(200, 150, 60, 0.15);
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
		color: #6a5c3a;
		text-decoration: none;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
		width: 100%;
	}
	.menu a:hover,
	.menu-toggle:hover {
		color: #c8a060;
		background: rgba(200, 150, 60, 0.05);
	}
	.menu-toggle { color: #9a8060; }
	.menu-divider {
		height: 1px;
		background: rgba(200, 150, 60, 0.08);
		margin: 0.3rem 0;
	}
</style>

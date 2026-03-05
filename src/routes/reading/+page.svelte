<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import allBooks from '$lib/books.json';

	// ── categories ──────────────────────────────────────────────
	const countMap = {};
	allBooks.forEach((b) => { countMap[b.category] = (countMap[b.category] || 0) + 1; });
	const categories = ['All', ...Object.entries(countMap).sort((a, b) => b[1] - a[1]).map(([c]) => c)];

	let activeCategory = 'All';
	$: filtered = activeCategory === 'All' ? allBooks : allBooks.filter((b) => b.category === activeCategory);

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

<svelte:window on:keydown={(e) => e.key === 'Escape' && closeMenu()} />

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
		<div class="filters">
			{#each categories as cat}
				<button
					class="pill"
					class:active={activeCategory === cat}
					on:click={() => { activeCategory = cat; closeMenu(); }}
				>
					{cat}
				</button>
			{/each}
		</div>

		<ul class="list">
			{#each filtered as book (book.id)}
				<li class:done={completed.has(book.id)}>
					<button class="row" on:click={(e) => openMenu(e, book)}>
						<span class="title">{book.title}</span>
						<span class="meta">
							{book.author}{book.year ? ` · ${book.year}` : ''}
						</span>
					</button>
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

	/* ── filters ─────────────────────────────────────────────── */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 2.5rem;
	}
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
	.pill.active { color: #c8a060; border-color: #c8a060; }

	/* ── list ────────────────────────────────────────────────── */
	.list {
		list-style: none;
		margin: 0; padding: 0;
	}
	li {
		border-bottom: 1px solid rgba(200, 150, 60, 0.05);
	}
	li.done .title {
		color: #c8a060;
	}
	li.done .title::after {
		content: ' ✓';
		font-size: 0.7em;
		color: #c8a060;
		opacity: 0.6;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
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

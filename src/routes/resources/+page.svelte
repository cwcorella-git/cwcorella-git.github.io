<script lang="ts">
	import data from '$lib/resources.json';
	import {
		groupByCluster, host, shortLabel, sortByName, suggestTags,
		type Resource, type Cluster
	} from '$lib/resourcesLogic';
	import { guideLetter } from '$lib/readingLogic';
	import JumpRail from '$lib/components/library/JumpRail.svelte';

	const items = data.items as Resource[];
	const clusters = data.clusters as Cluster[];

	// Same controls as /reading and /library: one search bar, tags that appear as you type, a sort.
	let query = $state('');
	let cluster = $state('');
	let selfHostableOnly = $state(false);
	let sort = $state<'topic' | 'name'>('topic');
	let dismissed = $state(false);

	let filter = $derived({ query, cluster, selfHostableOnly });
	let groups = $derived(groupByCluster(items, clusters, filter));
	let flat = $derived(sortByName(groups.flatMap((g) => g.items)));
	let shown = $derived(flat.length);
	let clusterName = $derived(clusters.find((c) => c.id === cluster)?.name ?? '');
	let tagSuggestions = $derived(dismissed ? [] : suggestTags(query, clusters, filter).slice(0, 4));

	function applyTag(t: { kind: string; id: string }) {
		if (t.kind === 'self') selfHostableOnly = true; else cluster = t.id;
		query = '';
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { query = ''; cluster = ''; selfHostableOnly = false; }
		if (e.key === 'Enter') dismissed = true;
	}

	// ── rail: topics in topic order, letters in A–Z order ──
	let rail = $derived(
		sort === 'topic'
			? groups.map((g) => ({ label: shortLabel(g.cluster), seek: `sec-${g.cluster.id}` }))
			: [...new Set(flat.map((r) => guideLetter(r.name)))].map((l) => ({ label: l, seek: l }))
	);
	const idOf = (r: Resource) => `r-${r.id}`;
	let activeLabel = $state<string | null>(null);

	function targetFor(seek: string): HTMLElement | null {
		if (seek.startsWith('sec-')) return document.getElementById(seek);
		const first = flat.find((r) => guideLetter(r.name) === seek);
		return first ? document.getElementById(idOf(first)) : null;
	}
	function scrollToEl(el: HTMLElement | null, smooth: boolean) {
		if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: smooth ? 'smooth' : 'auto' });
	}
	function seekTo(seek: string | null) {
		if (seek === null) window.scrollTo({ top: 0, behavior: 'smooth' });
		else scrollToEl(targetFor(seek), true);
	}
	function scrubTo(i: number) {
		const el = sort === 'topic'
			? document.getElementById(`sec-${groups[Math.min(i, groups.length - 1)]?.cluster.id}`)
			: document.getElementById(idOf(flat[Math.min(i, flat.length - 1)]));
		scrollToEl(el, false);
	}

	let frame = 0;
	function track() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			let current: string | null = rail[0]?.label ?? null;
			for (const a of rail) {
				const el = targetFor(a.seek!);
				if (el && el.getBoundingClientRect().top <= 100) current = a.label;
			}
			activeLabel = current;
		});
	}
	$effect(() => { void rail; track(); });
</script>

<svelte:head>
	<title>resources · cwcorella</title>
</svelte:head>

<svelte:window onkeydown={onKey} onscroll={track} onresize={track} />

<div class="page" role="main">
	<div class="inner" data-glass>
		<div class="search-area">
			<div class="search-bar">
				{#if cluster}
					<span class="tag-chip">{clusterName}<button class="chip-clear" onclick={() => (cluster = '')} aria-label="clear topic">×</button></span>
				{/if}
				{#if selfHostableOnly}
					<span class="tag-chip">self-hostable<button class="chip-clear" onclick={() => (selfHostableOnly = false)} aria-label="clear self-hostable">×</button></span>
				{/if}
				<input
					type="text" class="search-input" bind:value={query}
					placeholder={cluster || selfHostableOnly ? '' : `search ${items.length} resources, or a topic…`}
					oninput={() => (dismissed = false)}
					aria-label="search resources" autocomplete="off" spellcheck="false"
				/>
				{#each tagSuggestions as t (t.id)}
					<button class="pill" onclick={() => applyTag(t)}>{t.label}</button>
				{/each}
			</div>
			<select class="sort-sel" bind:value={sort} aria-label="sort by">
				<option value="topic">Topic</option>
				<option value="name">Name A–Z</option>
			</select>
		</div>

		<div class="list-and-rail">
			<div class="body">
				{#if sort === 'topic'}
					{#each groups as g (g.cluster.id)}
						<section id="sec-{g.cluster.id}">
							<h2>{g.cluster.name}</h2>
							<ul class="list">
								{#each g.items as r (r.id)}
									{@render row(r, false)}
								{/each}
							</ul>
						</section>
					{/each}
				{:else}
					<ul class="list">
						{#each flat as r (r.id)}
							{@render row(r, true)}
						{/each}
					</ul>
				{/if}
				{#if !shown}<p class="empty">nothing matches{query ? ` "${query}"` : ''}.</p>{/if}
			</div>
			{#if shown}
				<div class="rail-dock">
					<JumpRail anchors={rail} total={sort === 'topic' ? groups.length : shown} {activeLabel} vertical onSeek={seekTo} onScrubTo={scrubTo} />
				</div>
			{/if}
		</div>
		{#if shown}<p class="count">{shown} {shown === 1 ? 'resource' : 'resources'}</p>{/if}
	</div>
</div>

{#snippet row(r: Resource, withTopic: boolean)}
	<li id={idOf(r)}>
		<a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
		<span class="host">{host(r.url)}</span>
		<p>{r.oneLiner}</p>
		<span class="meta">
			{withTopic ? (clusters.find((c) => c.id === r.cluster)?.name ?? '') + ' · ' : ''}{r.kind}{#if r.license && r.license !== 'not-applicable' && r.license !== 'unknown'} · {r.license}{/if}{#if r.selfHostable === 'yes'} · self-hostable{/if}
		</span>
	</li>
{/snippet}

<style>
	.page { min-height: 100vh; padding-top: 4rem; }
	.inner {
		position: relative; z-index: 1; max-width: 760px; margin: 0 auto; padding: 3rem 2rem 6rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border); box-shadow: var(--glass-edge, none);
		will-change: background, border-color;
		color: var(--clr-text);
	}
	.search-area { display: flex; align-items: center; gap: 1rem; margin-bottom: 2.5rem; }
	.search-bar {
		display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; flex: 1; min-width: 0;
		background: rgba(var(--ui-rgb), 0.06); border: 1px solid var(--glass-border);
		border-radius: 3px; padding: 0.35rem 0.75rem;
	}
	.search-input {
		background: none; border: none; outline: none; flex: 1; min-width: 6rem;
		font-family: var(--font-ui); font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0; caret-color: currentColor;
	}
	.search-input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.tag-chip {
		display: inline-flex; align-items: center; gap: 0.4rem;
		background: rgba(0, 0, 0, 0.06); border: 1px solid var(--glass-border);
		border-radius: 2px; padding: 0.2rem 0.45rem 0.2rem 0.65rem;
		font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em;
		text-transform: uppercase; color: var(--clr-text); white-space: nowrap;
	}
	.chip-clear { background: none; border: none; cursor: pointer; color: var(--clr-text); opacity: 0.5; font-size: 0.85rem; padding: 0; line-height: 1; }
	.chip-clear:hover { opacity: 1; }
	.pill {
		background: none; border: 1px solid var(--glass-border); border-radius: 3px; padding: 0.25rem 0.65rem;
		font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
		color: var(--clr-text); cursor: pointer; white-space: nowrap; max-width: 14rem; overflow: hidden; text-overflow: ellipsis;
	}
	.sort-sel {
		background: none; border: 1px solid rgba(var(--ui-rgb), 0.28); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
		height: 1.75rem; padding: 0 0.5rem; flex-shrink: 0; cursor: pointer;
	}
	.sort-sel:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.list-and-rail { display: flex; align-items: flex-start; gap: 0.5rem; }
	.body { flex: 1; min-width: 0; }
	.rail-dock { position: sticky; top: 15vh; flex-shrink: 0; }
	section { margin-bottom: 2.25rem; scroll-margin-top: 4.5rem; }
	h2 { font-size: 1rem; font-weight: 500; margin: 0 0 0.5rem; }
	.list { list-style: none; margin: 0; padding: 0; }
	li { padding: 0.65rem 0; border-top: 1px solid var(--glass-border); scroll-margin-top: 4.5rem; }
	li a { color: var(--clr-text); font-weight: 500; text-decoration: underline; text-underline-offset: 2px; }
	.host { margin-left: 0.5rem; font-family: var(--font-ui); font-size: 0.68rem; opacity: 0.5; }
	li p { margin: 0.2rem 0; font-size: 0.85rem; line-height: 1.45; opacity: 0.85; }
	.meta { font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.5; }
	.empty { font-family: var(--font-ui); font-size: 0.72rem; opacity: 0.55; }
	.count { margin-top: 2rem; font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em; color: var(--clr-meta); }
	@media (max-width: 480px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.search-area { margin-bottom: 1.5rem; }
	}
</style>

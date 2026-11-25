<script lang="ts">
	import data from '$lib/resources.json';
	import { groupByCluster, host, type Resource, type Cluster } from '$lib/resourcesLogic';

	const items = data.items as Resource[];
	const clusters = data.clusters as Cluster[];

	let query = $state('');
	let cluster = $state('');
	let selfHostableOnly = $state(false);

	let groups = $derived(groupByCluster(items, clusters, { query, cluster, selfHostableOnly }));
	let shown = $derived(groups.reduce((n, g) => n + g.items.length, 0));
</script>

<svelte:head>
	<title>resources · cwcorella</title>
</svelte:head>

<div class="page" role="main">
	<div class="inner" data-glass>
		<h1>resources</h1>
		<p class="lede">
			Things I've looked into: what each one is, what it costs, and whether you can run it yourself.
			A hand-picked slice of a larger private catalogue.
		</p>

		<div class="controls">
			<input class="search-input" type="search" placeholder="search {items.length} resources" bind:value={query} aria-label="search resources" />
			<label class="check"><input type="checkbox" bind:checked={selfHostableOnly} /> self-hostable</label>
		</div>
		<div class="pills" role="group" aria-label="filter by topic">
			<button class="pill" class:active={cluster === ''} onclick={() => (cluster = '')}>all</button>
			{#each clusters as c (c.id)}
				<button class="pill" class:active={cluster === c.id} onclick={() => (cluster = cluster === c.id ? '' : c.id)}>{c.name}</button>
			{/each}
		</div>

		{#if groups.length > 1}
			<nav class="jump" aria-label="jump to section">
				<span class="jump-label">jump to</span>
				{#each groups as g (g.cluster.id)}
					<a href="#sec-{g.cluster.id}">{g.cluster.name} <span class="n">{g.items.length}</span></a>
				{/each}
			</nav>
		{/if}

		{#each groups as g (g.cluster.id)}
			<section id="sec-{g.cluster.id}">
				<h2>{g.cluster.name}</h2>
				<p class="desc">{g.cluster.description}</p>
				<ul class="list">
					{#each g.items as r (r.id)}
						<li>
							<a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a>
							<span class="host">{host(r.url)}</span>
							<p>{r.oneLiner}</p>
							<span class="meta">
								{r.kind}{#if r.license && r.license !== 'not-applicable' && r.license !== 'unknown'} · {r.license}{/if}{#if r.selfHostable === 'yes'} · self-hostable{/if}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{:else}
			<p class="empty">nothing matches{query ? ` "${query}"` : ''}.</p>
		{/each}
		{#if groups.length}<p class="count">{shown} shown</p>{/if}
	</div>
</div>

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
	h1 { font-size: 1.4rem; font-weight: 500; margin: 0 0 0.5rem; }
	.lede { margin: 0 0 1.75rem; opacity: 0.75; font-size: 0.9rem; line-height: 1.5; }
	.controls { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.9rem; }
	.search-input {
		background: none; border: none; border-bottom: 1px solid var(--glass-border); outline: none; flex: 1;
		font-family: var(--font-ui); font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0; caret-color: currentColor;
	}
	.search-input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.check { font-family: var(--font-ui); font-size: 0.7rem; letter-spacing: 0.06em; white-space: nowrap; display: flex; gap: 0.4rem; align-items: center; }
	.pills { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 2rem; }
	.pill {
		background: none; border: 1px solid var(--glass-border); border-radius: 3px; padding: 0.25rem 0.65rem;
		font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.6; cursor: pointer; transition: all 0.15s;
	}
	.pill:hover, .pill.active { opacity: 1; }
	.pill.active { background: rgba(0, 0, 0, 0.06); }
	.jump { display: flex; flex-wrap: wrap; gap: 0.35rem 1.1rem; align-items: baseline; margin: -0.5rem 0 2rem; padding: 0.7rem 0; border-top: 1px solid var(--glass-border); border-bottom: 1px solid var(--glass-border); }
	.jump-label { font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.5; }
	.jump a { color: var(--clr-text); font-size: 0.8rem; opacity: 0.8; text-decoration: none; }
	.jump a:hover { opacity: 1; text-decoration: underline; text-underline-offset: 2px; }
	.jump .n { font-family: var(--font-ui); font-size: 0.62rem; opacity: 0.5; margin-left: 0.15rem; }
	section { margin-bottom: 2.25rem; scroll-margin-top: 4.5rem; }
	h2 { font-size: 1rem; font-weight: 500; margin: 0 0 0.25rem; }
	.desc { margin: 0 0 0.9rem; opacity: 0.6; font-size: 0.8rem; line-height: 1.45; }
	.list { list-style: none; margin: 0; padding: 0; }
	li { padding: 0.65rem 0; border-top: 1px solid var(--glass-border); }
	li a { color: var(--clr-text); font-weight: 500; text-decoration: underline; text-underline-offset: 2px; }
	.host { margin-left: 0.5rem; font-family: var(--font-ui); font-size: 0.68rem; opacity: 0.5; }
	li p { margin: 0.2rem 0; font-size: 0.85rem; line-height: 1.45; opacity: 0.85; }
	.meta { font-family: var(--font-ui); font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.5; }
	.empty, .count { font-family: var(--font-ui); font-size: 0.72rem; opacity: 0.55; }
	@media (max-width: 640px) {
		.page { padding-top: 4.5rem; }
		.inner { padding: 1.5rem 1.25rem 4rem; }
		.controls { flex-direction: column; align-items: stretch; gap: 0.5rem; }
		.jump { flex-wrap: nowrap; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
		.jump::-webkit-scrollbar { display: none; }
	}
</style>

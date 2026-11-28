<script lang="ts">
	import homeContent from '$lib/content/home.json';
	import HomeEditor from '$lib/components/HomeEditor.svelte';
	import { homeState, adminState, writeQueue } from '$lib/admin/state.svelte';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { onMount } from 'svelte';

	let editing = $state(false);

	// The panel starts minimised (2026-11-28): the page opens on the scene alone.
	// The choice is remembered for this browser.
	let open = $state(false);
	onMount(() => { open = localStorage.getItem('cwc-home-open') === '1'; });
	function toggle() {
		open = !open;
		localStorage.setItem('cwc-home-open', open ? '1' : '0');
	}

	// Fall back to static build value if no draft has been restored
	let content = $derived(homeState.content ?? homeContent.content);
	// Through renderMarkdown, not marked directly: that is where sanitising lives.
	let rendered = $derived(renderMarkdown(content));

	function save(newContent: string) {
		homeState.set(newContent);
		editing = false;
		writeQueue.push({ domain: 'home', content: newContent });
	}
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Reno, NV." />
</svelte:head>

<div class="page">

	<main>
		{#if editing}
			<HomeEditor content={content} onSave={save} onCancel={() => (editing = false)} />
		{:else if !open}
			<button class="restore" data-glass onclick={toggle} aria-expanded="false" title="Show">+ home</button>
		{:else}
			<div class="content-panel" data-glass>
				<button class="min" onclick={toggle} aria-expanded="true" title="Minimise" aria-label="Minimise">–</button>
				<div class="prose">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html rendered}
				</div>
				{#if adminState.active}
					<button class="edit-btn" onclick={() => (editing = true)}>✎ edit</button>
				{/if}
			</div>
		{/if}
	</main>

	<footer>
		<a data-glass href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github</a>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		padding-top: 4rem;
	}

	main {
		position: relative;
		z-index: 1;
		flex: 1;
		max-width: 560px;
		margin: 0 auto;
		padding: 2rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.content-panel {
		position: relative;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		box-shadow: var(--glass-edge, none);
		padding: 2.5rem 2.5rem 2.5rem;
		display: flex;
		flex-direction: column;
	}

	/* Prose styles for markdown-rendered content */
	:global(.prose p) {
		font-size: 1rem;
		line-height: 1.9;
		color: var(--clr-text);
		margin-bottom: 1.5rem;
		margin-top: 0;
	}
	:global(.prose blockquote) {
		margin: 1.5rem 0 0;
		padding: 0;
		border: none;
		font-size: 1rem;
		line-height: 1.9;
		color: var(--clr-text);
		font-style: italic;
	}
	:global(.prose blockquote p) {
		margin: 0;
		color: var(--clr-text);
	}
	:global(.prose strong) { font-weight: normal; letter-spacing: 0.04em; }
	:global(.prose em) { font-style: italic; }

	.min {
		position: absolute;
		top: 0.5rem; right: 0.6rem;
		background: none; border: none; cursor: pointer;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 1.1rem; line-height: 1;
		padding: 0.2rem 0.5rem;
		opacity: 0.6;
	}
	.min:hover { opacity: 1; }
	.restore {
		align-self: center;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		border-radius: 999px;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.65rem; letter-spacing: 0.1em;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
	}

	.edit-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.15);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		align-self: flex-start;
		margin-top: 0.5rem;
	}
	.edit-btn:hover { color: var(--clr-text); border-color: rgba(var(--ui-rgb), 0.40); }

	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: var(--clr-text);
	}
	/* A small glass pill: the link sits over the meadow, which the contrast
	   check only sees through [data-glass]. */
	footer a {
		display: inline-block;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: var(--clr-text); }

	@media (max-width: 480px) {
		main { padding: 1.25rem; }
		.content-panel { padding: 1.5rem 1.25rem; }
	}
	@media (max-width: 480px) {
		:global(.prose p),
		:global(.prose blockquote) {
			line-height: 1.65;
			font-size: 0.95rem;
			margin-bottom: 1.1rem;
		}
	}
</style>

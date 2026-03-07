<script lang="ts">
	import homeContent from '$lib/content/home.json';
	import HomeEditor from '$lib/components/HomeEditor.svelte';
	import { homeState, adminState, writeQueue } from '$lib/admin/state.svelte';
	import { marked } from 'marked';

	let editing = $state(false);

	// Fall back to static build value if no draft has been restored
	let content = $derived(homeState.content ?? homeContent.content);
	let rendered = $derived(marked(content) as string);

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
		{:else}
			<div class="content-panel">
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
		<a href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github</a>
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
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 2.5rem 2.5rem 2.5rem;
		display: flex;
		flex-direction: column;
		animation: reveal 0.18s ease both;
	}
	@keyframes reveal {
		from { opacity: 0; }
		to   { opacity: 1; }
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
	:global(.prose strong) { color: var(--clr-text); font-weight: normal; letter-spacing: 0.01em; }
	:global(.prose em) { font-style: italic; }

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
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: var(--clr-text); }
</style>

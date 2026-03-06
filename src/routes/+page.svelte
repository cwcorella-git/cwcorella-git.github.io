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
			<div class="prose">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html rendered}
			</div>
			{#if adminState.editMode}
				<button class="edit-btn" onclick={() => (editing = true)}>✎ edit</button>
			{/if}
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
		padding: 2.5rem 2.5rem 3rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		background: rgba(255, 248, 231, 0.88);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(180, 150, 100, 0.18);
	}

	/* Prose styles for markdown-rendered content */
	:global(.prose p) {
		font-size: 1rem;
		line-height: 1.9;
		color: #4a3820;
		margin-bottom: 1.5rem;
		margin-top: 0;
	}
	:global(.prose blockquote) {
		margin: 1.5rem 0 0;
		padding: 0;
		border: none;
		font-size: 1rem;
		line-height: 1.9;
		color: #8a6a40;
		font-style: italic;
	}
	:global(.prose blockquote p) {
		margin: 0;
		color: #8a6a40;
	}
	:global(.prose strong) { color: #5a4020; font-weight: normal; letter-spacing: 0.01em; }
	:global(.prose em) { font-style: italic; }

	.edit-btn {
		background: none;
		border: 1px solid rgba(100, 75, 40, 0.15);
		color: #b09070;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		align-self: flex-start;
		margin-top: 0.5rem;
	}
	.edit-btn:hover { color: #7a5020; border-color: rgba(100, 75, 40, 0.4); }

	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: #9a7a50;
	}
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: #7a5020; }
</style>

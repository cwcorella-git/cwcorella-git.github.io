<script lang="ts">
	import homeContent from '$lib/content/home.json';
	import HomeEditor from '$lib/components/HomeEditor.svelte';
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import { marked } from 'marked';

	let content = $state(homeContent.content);
	let editing = $state(false);

	// Render markdown → HTML for display
	let rendered = $derived(marked(content) as string);

	function save(newContent: string) {
		content = newContent;
		editing = false;
		writeQueue.push({ domain: 'home', content: newContent });
	}
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Reno, NV." />
</svelte:head>

<div class="page">
	<div class="glow" aria-hidden="true"></div>

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
		background-image:
			linear-gradient(rgba(200, 150, 60, 0.016) 1px, transparent 1px),
			linear-gradient(90deg, rgba(200, 150, 60, 0.016) 1px, transparent 1px);
		background-size: 48px 48px;
	}

	.glow {
		position: fixed;
		top: 35%; left: 30%;
		width: 700px; height: 700px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(200, 120, 40, 0.06) 0%, transparent 65%);
		animation: breathe 18s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
	}
	@keyframes breathe {
		0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
		50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.2); }
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

	/* Prose styles for markdown-rendered content */
	:global(.prose p) {
		font-size: 1rem;
		line-height: 1.9;
		color: #b8a880;
		margin-bottom: 1.5rem;
		margin-top: 0;
	}
	:global(.prose blockquote) {
		margin: 1.5rem 0 0;
		padding: 0;
		border: none;
		font-size: 1rem;
		line-height: 1.9;
		color: #7a6a4a;
		font-style: italic;
	}
	:global(.prose blockquote p) {
		margin: 0;
		color: #7a6a4a;
	}
	:global(.prose strong) { color: #c8b888; font-weight: normal; letter-spacing: 0.01em; }
	:global(.prose em) { font-style: italic; }

	.edit-btn {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.15);
		color: #4e4232;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		align-self: flex-start;
		margin-top: 0.5rem;
	}
	.edit-btn:hover { color: #c8a060; border-color: rgba(200, 150, 60, 0.4); }

	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: #5a4e38;
	}
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: #c8a060; }
</style>

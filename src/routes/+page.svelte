<script lang="ts">
	import homeContent from '$lib/content/home.json';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import { adminState } from '$lib/admin/state.svelte';
	import { getFile, putFile } from '$lib/admin/github';

	let paragraphs = $state([...homeContent.paragraphs]);
	let blockquote = $state(homeContent.blockquote);

	async function saveParagraph(index: number, newText: string) {
		const updated = [...paragraphs];
		updated[index] = newText;
		const newContent = { paragraphs: updated, blockquote };
		const { sha } = await getFile(adminState.pat, 'src/lib/content/home.json');
		await putFile(
			adminState.pat,
			'src/lib/content/home.json',
			JSON.stringify(newContent, null, '\t'),
			sha,
			'update home content'
		);
		paragraphs = updated;
	}

	async function saveBlockquote(newText: string) {
		const newContent = { paragraphs, blockquote: newText };
		const { sha } = await getFile(adminState.pat, 'src/lib/content/home.json');
		await putFile(
			adminState.pat,
			'src/lib/content/home.json',
			JSON.stringify(newContent, null, '\t'),
			sha,
			'update home content'
		);
		blockquote = newText;
	}
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Reno, NV." />
</svelte:head>

<div class="page">
	<div class="glow" aria-hidden="true"></div>

	<main>
		{#each paragraphs as para, i}
			<p>
				{#if adminState.editMode}
					<InlineEditor content={para} onSave={(t) => saveParagraph(i, t)} />
				{:else}
					{para}
				{/if}
			</p>
		{/each}

		<blockquote>
			{#if adminState.editMode}
				<InlineEditor content={blockquote} onSave={saveBlockquote} />
			{:else}
				{blockquote}
			{/if}
		</blockquote>
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

	main p {
		font-size: 1rem;
		line-height: 1.9;
		color: #b8a880;
		margin-bottom: 1.5rem;
	}

	blockquote {
		margin: 1.5rem 0 0;
		padding: 0;
		border: none;
		font-size: 1rem;
		line-height: 1.9;
		color: #7a6a4a;
		font-style: italic;
	}

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

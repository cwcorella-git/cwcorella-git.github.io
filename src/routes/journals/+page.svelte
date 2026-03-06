<script lang="ts">
	import { adminState } from '$lib/admin/state.svelte';
	import { decryptDoc } from '$lib/admin/crypto';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { toast } from '$lib/admin/toast.svelte';

	interface JournalMeta { slug: string; title: string; date: string | null; }

	let index = $state<JournalMeta[]>([]);
	let indexLoaded = $state(false);
	let indexError = $state('');

	let selected = $state<JournalMeta | null>(null);
	let readerHtml = $state('');
	let readerLoading = $state(false);

	// Load the encrypted index whenever admin becomes active
	$effect(() => {
		if (adminState.active && !indexLoaded) {
			loadIndex();
		}
	});

	async function loadIndex() {
		indexError = '';
		try {
			const res = await fetch('/docs/private/journals-index.enc');
			if (!res.ok) throw new Error(res.status === 404 ? 'Index not found — run scripts/encrypt-journals.mjs first.' : `HTTP ${res.status}`);
			const enc = await res.json();
			const json = await decryptDoc(enc, adminState.contentKey);
			index = JSON.parse(json);
			indexLoaded = true;
		} catch (e: unknown) {
			if (e instanceof Error && e.name === 'OperationError') {
				indexError = 'Incorrect content key.';
			} else {
				indexError = e instanceof Error ? e.message : 'Failed to load index.';
			}
		}
	}

	async function openEntry(entry: JournalMeta) {
		selected = entry;
		readerHtml = '';
		readerLoading = true;
		try {
			const res = await fetch(`/docs/private/journals/${entry.slug}.enc`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const enc = await res.json();
			const markdown = await decryptDoc(enc, adminState.contentKey);
			readerHtml = renderMarkdown(markdown);
		} catch (e: unknown) {
			if (e instanceof Error && e.name === 'OperationError') {
				toast.error('incorrect content key');
			} else {
				toast.error(e instanceof Error ? e.message : 'Failed to load entry.');
			}
			selected = null;
		} finally {
			readerLoading = false;
		}
	}

	function closeReader() { selected = null; readerHtml = ''; }

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeReader();
	}
</script>

<svelte:head>
	<title>journals — cwcorella</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if adminState.active}
	<!-- ── reader overlay ───────────────────────────────────── -->
	{#if selected}
		<div class="reader-backdrop" role="presentation" onclick={closeReader}></div>
		<div class="reader" role="dialog" aria-modal="true" aria-label={selected.title}>
			<div class="reader-header">
				<div class="reader-meta">
					<span class="reader-title">{selected.title}</span>
					{#if selected.date}<span class="reader-date">{selected.date}</span>{/if}
				</div>
				<button class="reader-close" onclick={closeReader} aria-label="Close">×</button>
			</div>
			<div class="reader-body">
				{#if readerLoading}
					<p class="status">decrypting…</p>
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html readerHtml}
				{/if}
			</div>
		</div>
	{/if}

	<!-- ── main page ────────────────────────────────────────── -->
	<div class="page">
		<div class="glow" aria-hidden="true"></div>
		<div class="inner">
			<h1 class="heading">journals</h1>

			{#if indexError}
				<p class="status error">{indexError}</p>
			{:else if !indexLoaded}
				<p class="status">decrypting index…</p>
			{:else if index.length === 0}
				<p class="status">no entries — run scripts/encrypt-journals.mjs to populate.</p>
			{:else}
				<ul class="list">
					{#each index as entry (entry.slug)}
						<li>
							<button class="entry-row" onclick={() => openEntry(entry)}>
								<span class="entry-title">{entry.title}</span>
								{#if entry.date}<span class="entry-date">{entry.date}</span>{/if}
							</button>
						</li>
					{/each}
				</ul>
				<p class="count">{index.length} entries</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── page ─────────────────────────────────────────────── */
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

	.heading {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1rem;
		font-weight: normal;
		letter-spacing: 0.12em;
		color: #c8a060;
		margin: 0 0 2.5rem;
	}

	.status {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		color: #5a4e38;
	}
	.status.error { color: #c07050; }

	/* ── list ─────────────────────────────────────────────── */
	.list { list-style: none; margin: 0; padding: 0; }

	.entry-row {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid rgba(200, 150, 60, 0.09);
		padding: 0.85rem 0;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}
	.entry-row:hover { background: rgba(200, 150, 60, 0.03); }

	.entry-title {
		flex: 1;
		font-size: 0.95rem;
		color: #c0b088;
		line-height: 1.4;
	}

	.entry-date {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: #4e4232;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.count {
		margin-top: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: #5a4e38;
	}

	/* ── reader overlay ───────────────────────────────────── */
	.reader-backdrop {
		position: fixed;
		inset: 0;
		z-index: 299;
		background: rgba(0, 0, 0, 0.55);
	}

	.reader {
		position: fixed;
		inset: 0;
		z-index: 300;
		background: #0c0902;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.reader-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.2rem 2rem;
		border-bottom: 1px solid rgba(200, 150, 60, 0.12);
		flex-shrink: 0;
	}

	.reader-meta {
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}

	.reader-title {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 0.95rem;
		color: #c0b088;
	}

	.reader-date {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: #5a4e38;
	}

	.reader-close {
		background: none;
		border: none;
		color: #6a5a40;
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}
	.reader-close:hover { color: #c8a060; }

	.reader-body {
		flex: 1;
		overflow-y: auto;
		padding: 2.5rem 3rem;
		max-width: 72ch;
		margin: 0 auto;
		width: 100%;
	}

	/* markdown content styles */
	.reader-body :global(h1),
	.reader-body :global(h2),
	.reader-body :global(h3) {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-weight: normal;
		color: #c8a060;
		margin: 2rem 0 0.75rem;
		line-height: 1.3;
	}
	.reader-body :global(h1) { font-size: 1.2rem; }
	.reader-body :global(h2) { font-size: 1rem; }
	.reader-body :global(h3) { font-size: 0.9rem; }

	.reader-body :global(p) {
		color: #c0b088;
		font-size: 0.95rem;
		line-height: 1.85;
		margin: 0 0 1.1rem;
	}

	.reader-body :global(blockquote) {
		border-left: 2px solid rgba(200, 150, 60, 0.3);
		margin: 1.2rem 0;
		padding: 0.1rem 1.2rem;
		color: #8a7858;
	}

	.reader-body :global(code) {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.82em;
		background: rgba(200, 150, 60, 0.07);
		padding: 0.1em 0.35em;
		color: #b89858;
	}

	.reader-body :global(pre) {
		background: rgba(200, 150, 60, 0.05);
		border: 1px solid rgba(200, 150, 60, 0.12);
		padding: 1rem 1.2rem;
		overflow-x: auto;
		margin: 1.2rem 0;
	}

	.reader-body :global(ul),
	.reader-body :global(ol) {
		color: #c0b088;
		font-size: 0.95rem;
		line-height: 1.85;
		padding-left: 1.5rem;
		margin: 0 0 1rem;
	}

	.reader-body :global(hr) {
		border: none;
		border-top: 1px solid rgba(200, 150, 60, 0.12);
		margin: 2rem 0;
	}
</style>

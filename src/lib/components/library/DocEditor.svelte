<script lang="ts">
	import { untrack } from 'svelte';
	import { renderLibraryMarkdown, shouldUseMath } from '$lib/markdown/library';
	import '$lib/markdown/lib-prose.css';
	import { docToDraft, type EditDraft } from '$lib/library/editLogic';
	import type { LibraryDoc } from '$lib/library/types';
	import TagEditor from './TagEditor.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import {
		DOC_TYPES, docToMetaDraft, metaPayload, metaProblems, cleanLinks, type MetaDraft
	} from '$lib/library/metaLogic';
	import type { ReadingLink } from '$lib/library/types';

	let { doc, onSave, onCancel }: {
		doc: LibraryDoc;
		onSave: (draft: EditDraft) => Promise<void>;
		onCancel: () => void;
	} = $props();

	let draft = $state<EditDraft>(untrack(() => docToDraft(doc)));
	let mode = $state<'write' | 'preview'>('write');
	let saving = $state(false);
	let textareaEl = $state<HTMLTextAreaElement>();

	// Document details and reading links save on their own button (separate API
	// calls from the body save), so a failed one never loses the text being edited.
	const metaBefore = untrack(() => docToMetaDraft(doc));
	let meta = $state<MetaDraft>({ ...metaBefore });
	let links = $state<ReadingLink[]>(untrack(() => (doc.reading?.links ?? []).map((l) => ({ ...l }))));
	let savingMeta = $state(false);
	const problems = $derived(metaProblems(meta));

	async function saveDetails() {
		const payload = metaPayload(metaBefore, meta);
		if (!payload || problems.length) return;
		savingMeta = true;
		try {
			if (await libraryState.saveMeta(payload)) toast.success('details saved');
		} finally { savingMeta = false; }
	}
	async function saveLinks() {
		const { links: clean, problems: bad } = cleanLinks(links);
		if (bad.length) { toast.error(bad[0]); return; }
		savingMeta = true;
		try {
			if (await libraryState.saveReadingLinks(clean)) { links = clean.map((l) => ({ ...l })); toast.success('links saved'); }
		} finally { savingMeta = false; }
	}
	function moveLink(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= links.length) return;
		const next = [...links];
		[next[i], next[j]] = [next[j], next[i]];
		links = next;
	}

	const previewHtml = $derived(mode === 'preview' ? renderLibraryMarkdown(draft.body, { math: shouldUseMath(doc.source) }) : '');

	function wrap(before: string, after: string) {
		const el = textareaEl;
		if (!el) return;
		const start = el.selectionStart, end = el.selectionEnd;
		const selected = draft.body.slice(start, end);
		const replacement = before + (selected || 'text') + after;
		draft.body = draft.body.slice(0, start) + replacement + draft.body.slice(end);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + before.length, start + before.length + (selected || 'text').length);
		});
	}
	function prefixLine(prefix: string) {
		const el = textareaEl;
		if (!el) return;
		const start = el.selectionStart;
		const lineStart = draft.body.slice(0, start).lastIndexOf('\n') + 1;
		draft.body = draft.body.slice(0, lineStart) + prefix + draft.body.slice(lineStart);
		requestAnimationFrame(() => el.focus());
	}
	async function save() {
		saving = true;
		try { await onSave(draft); } finally { saving = false; }
	}
</script>

<div class="doc-editor">
	<!-- draft.title was always saved (draftToPayload sends it, the API stores it in
	     edits.title); there was simply no field to change it in. -->
	<label class="title-field">
		<span class="visually-hidden">Title</span>
		<input type="text" bind:value={draft.title} placeholder="Title" spellcheck="true" />
	</label>

	<details class="details">
		<summary>details{doc.reading ? ' and reading links' : ''}</summary>
		<p class="warn">These edit the document's own record{doc.source === 'user' ? ' (which VG also holds)' : ''}.
			They are saved separately from the text.</p>
		<div class="grid">
			<label>author <input type="text" bind:value={meta.author} /></label>
			<label>date <input type="text" bind:value={meta.publication_date} placeholder="YYYY, YYYY-MM or YYYY-MM-DD" /></label>
			<label>precision
				<select bind:value={meta.date_precision}>
					<option value="">(unset)</option><option value="year">year</option>
					<option value="month">month</option><option value="day">day</option>
				</select>
			</label>
			<label>type
				<select bind:value={meta.document_type}>
					{#each DOC_TYPES as t (t)}<option value={t}>{t}</option>{/each}
				</select>
			</label>
			<label class="wide">source URL <input type="url" bind:value={meta.source_url} /></label>
		</div>
		{#if problems.length}<p class="bad">{problems.join('; ')}</p>{/if}
		<button type="button" class="mini" onclick={saveDetails}
			disabled={savingMeta || problems.length > 0 || !metaPayload(metaBefore, meta)}>save details</button>

		{#if doc.reading}
			<p class="hd">reading links</p>
			{#each links as l, i (i)}
				<div class="link">
					<input type="text" bind:value={l.name} placeholder="name" aria-label="link name" />
					<input type="url" bind:value={l.url} placeholder="https://" aria-label="link url" />
					<button type="button" class="mini" onclick={() => moveLink(i, -1)} aria-label="move up">↑</button>
					<button type="button" class="mini" onclick={() => moveLink(i, 1)} aria-label="move down">↓</button>
					<button type="button" class="mini" onclick={() => (links = links.filter((_, k) => k !== i))} aria-label="remove link">x</button>
				</div>
			{/each}
			<button type="button" class="mini" onclick={() => (links = [...links, { name: '', url: '' }])}>add link</button>
			<button type="button" class="mini" onclick={saveLinks} disabled={savingMeta}>save links</button>
		{/if}
	</details>

	<div class="toolbar">
		{#if mode === 'write'}
			<button type="button" onclick={() => wrap('**', '**')} title="Bold">B</button>
			<button type="button" class="italic" onclick={() => wrap('*', '*')} title="Italic">I</button>
			<button type="button" onclick={() => wrap('~~', '~~')} title="Strikethrough">S</button>
			<div class="sep"></div>
			<button type="button" onclick={() => prefixLine('## ')} title="Heading">H</button>
			<button type="button" onclick={() => prefixLine('- ')} title="Bullet list">•</button>
			<button type="button" onclick={() => prefixLine('1. ')} title="Numbered list">1.</button>
			<button type="button" onclick={() => wrap('[', '](url)')} title="Link">🔗</button>
		{/if}
		<div class="spacer"></div>
		<button type="button" class:active={mode === 'write'} onclick={() => (mode = 'write')}>Write</button>
		<button type="button" class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
	</div>

	{#if mode === 'write'}
		<textarea bind:value={draft.body} bind:this={textareaEl} spellcheck="true"></textarea>
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="preview doc-body lib-prose">{@html previewHtml}</div>
	{/if}

	<TagEditor tags={draft.tags} onChange={(t) => (draft.tags = t)} />

	<div class="actions">
		<button class="cancel" onclick={onCancel} disabled={saving}>cancel</button>
		<button class="save" onclick={save} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
	</div>
</div>

<style>
	.doc-editor { display: flex; flex-direction: column; }
	.title-field input { width: 100%; box-sizing: border-box; margin-bottom: 0.75rem;
		background: rgba(var(--ui-rgb), 0.05); border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text); font-family: var(--font-prose); font-size: 1.4rem; padding: 0.4rem 0.6rem; }
	.details { margin-bottom: 0.75rem; border: 1px solid rgba(var(--ui-rgb), 0.18); padding: 0.4rem 0.6rem;
		font-family: var(--font-ui); font-size: 0.65rem; color: var(--clr-text); }
	.details summary { cursor: pointer; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.55rem; }
	.warn { opacity: 0.65; margin: 0.4rem 0; }
	.bad { color: var(--clr-danger); margin: 0.3rem 0; }
	.hd { margin: 0.7rem 0 0.3rem; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.5rem; opacity: 0.6; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.4rem 0.6rem; }
	.grid label { display: flex; flex-direction: column; gap: 0.15rem; }
	.grid .wide { grid-column: 1 / -1; }
	.details input, .details select { background: rgba(var(--ui-rgb), 0.05); border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text); font-family: var(--font-ui); font-size: 0.7rem; padding: 0.25rem 0.4rem; }
	.link { display: flex; gap: 0.3rem; margin-bottom: 0.3rem; }
	.link input:nth-child(1) { flex: 0 0 8rem; } .link input:nth-child(2) { flex: 1; min-width: 0; }
	.mini { background: none; border: 1px solid rgba(var(--ui-rgb), 0.3); color: var(--clr-text); cursor: pointer;
		font-family: var(--font-ui); font-size: 0.55rem; text-transform: uppercase; padding: 0.15rem 0.5rem; margin-top: 0.4rem; }
	.mini:disabled { opacity: 0.4; cursor: default; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.toolbar { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.toolbar button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.22); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.7rem; padding: 0.15rem 0.45rem; cursor: pointer; }
	.toolbar button.active { background: rgba(var(--ui-rgb), 0.14); border-color: var(--clr-text); }
	.toolbar .italic { font-style: italic; }
	.toolbar .sep { width: 1px; height: 1rem; background: rgba(var(--ui-rgb), 0.25); margin: 0 0.25rem; }
	.toolbar .spacer { flex: 1; }
	textarea { min-height: 50vh; resize: vertical; background: rgba(var(--ui-rgb), 0.05);
		border: 1px solid rgba(var(--ui-rgb), 0.22); color: var(--clr-text);
		font-family: var(--font-prose); font-size: 0.95rem; line-height: 1.8; padding: 1rem; }
	.preview { min-height: 50vh; }
	.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
	.actions button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.3); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.3rem 0.8rem; cursor: pointer; }
	.actions .save { border-color: var(--clr-text); }
</style>

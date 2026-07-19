<script lang="ts">
	import { untrack } from 'svelte';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { docToDraft, type EditDraft } from '$lib/library/editLogic';
	import type { LibraryDoc } from '$lib/library/types';
	import TagEditor from './TagEditor.svelte';

	let { doc, onSave, onCancel }: {
		doc: LibraryDoc;
		onSave: (draft: EditDraft) => Promise<void>;
		onCancel: () => void;
	} = $props();

	let draft = $state<EditDraft>(untrack(() => docToDraft(doc)));
	let mode = $state<'write' | 'preview'>('write');
	let saving = $state(false);
	let textareaEl = $state<HTMLTextAreaElement>();

	const previewHtml = $derived(mode === 'preview' ? renderMarkdown(draft.body) : '');

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
		<div class="preview doc-body">{@html previewHtml}</div>
	{/if}

	<TagEditor tags={draft.tags} onChange={(t) => (draft.tags = t)} />

	<div class="actions">
		<button class="cancel" onclick={onCancel} disabled={saving}>cancel</button>
		<button class="save" onclick={save} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
	</div>
</div>

<style>
	.doc-editor { display: flex; flex-direction: column; }
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

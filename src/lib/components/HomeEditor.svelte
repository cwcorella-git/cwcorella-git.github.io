<script lang="ts">
	import { untrack } from 'svelte';

	let {
		content,
		onSave,
		onCancel
	}: {
		content: string;
		onSave: (newContent: string) => void;
		onCancel: () => void;
	} = $props();

	let draft = $state(untrack(() => content));
	let textareaEl = $state<HTMLTextAreaElement>();

	function save() {
		onSave(draft);
	}

	function wrap(before: string, after: string) {
		const el = textareaEl as HTMLTextAreaElement;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const selected = draft.slice(start, end);
		const replacement = before + (selected || 'text') + after;
		draft = draft.slice(0, start) + replacement + draft.slice(end);
		// Restore selection around inserted text
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + before.length, start + before.length + (selected || 'text').length);
		});
	}

	function insertBlockquote() {
		const el = textareaEl as HTMLTextAreaElement;
		const start = el.selectionStart;
		// Find line start
		const before = draft.slice(0, start);
		const lineStart = before.lastIndexOf('\n') + 1;
		const line = draft.slice(lineStart, start);
		if (line.startsWith('> ')) {
			draft = draft.slice(0, lineStart) + line.slice(2) + draft.slice(start);
		} else {
			draft = draft.slice(0, lineStart) + '> ' + draft.slice(lineStart);
		}
		requestAnimationFrame(() => { (textareaEl as HTMLTextAreaElement).focus(); });
	}
</script>

<div class="home-editor">
	<div class="toolbar">
		<button type="button" onclick={() => wrap('**', '**')} title="Bold">B</button>
		<button type="button" onclick={() => wrap('*', '*')} title="Italic" class="italic">I</button>
		<div class="sep"></div>
		<button type="button" onclick={insertBlockquote} title="Blockquote">"</button>
		<div class="sep"></div>
		<span class="hint">↵↵ = new paragraph</span>
	</div>
	<textarea
		bind:value={draft}
		bind:this={textareaEl}
		rows={10}
		spellcheck="true"
	></textarea>
	<div class="actions">
		<button class="cancel" onclick={onCancel}>cancel</button>
		<button class="save" onclick={save}>save</button>
	</div>
</div>

<style>
	.home-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.10);
	}

	.toolbar button {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		width: 1.8rem;
		height: 1.6rem;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.toolbar button:hover { color: var(--clr-text); border-color: rgba(255, 255, 255, 0.28); }
	.toolbar button.italic { font-style: italic; }

	.sep {
		width: 1px;
		height: 1rem;
		background: rgba(255, 255, 255, 0.12);
		margin: 0 0.2rem;
	}

	.hint {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.55rem;
		letter-spacing: 0.06em;
		color: var(--clr-text);
		margin-left: auto;
	}

	textarea {
		width: 100%;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: var(--clr-text);
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.9;
		padding: 0.6rem;
		resize: vertical;
		outline: none;
		transition: border-color 0.15s;
	}
	textarea:focus { border-color: rgba(255, 255, 255, 0.32); }

	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	button.cancel,
	button.save {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: var(--clr-text);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button.cancel:hover:not(:disabled) { color: var(--clr-text); border-color: rgba(255, 255, 255, 0.32); }
	button.save {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.25);
		color: var(--clr-text);
	}
	button.save:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

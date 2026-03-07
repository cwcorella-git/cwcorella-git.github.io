<script lang="ts">
	import { adminState } from '$lib/admin/state.svelte';
	import { toast } from '$lib/admin/toast.svelte';

	let {
		content,
		onSave
	}: {
		content: string;
		onSave: (newContent: string) => Promise<void>;
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);

	function startEdit() {
		if (!adminState.active) return;
		draft = content;
		editing = true;
	}

	function cancel() {
		editing = false;
	}

	async function save() {
		saving = true;
		try {
			await onSave(draft);
			editing = false;
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			saving = false;
		}
	}
</script>

{#if editing}
	<div class="editor">
		<textarea bind:value={draft} rows={5}></textarea>
		<div class="actions">
			<button onclick={cancel} disabled={saving}>cancel</button>
			<button class="save" onclick={save} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
		</div>
	</div>
{:else if adminState.active}
	<span
		class="editable"
		role="button"
		tabindex="0"
		onclick={startEdit}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(); }}
		title="Click to edit"
	>{content}</span>
{:else}
	<span>{content}</span>
{/if}

<style>
	.editable {
		cursor: text;
		border-bottom: 1px dashed rgba(var(--dark-panel-rgb), 0.22);
		transition: border-color 0.15s;
	}
	.editable:hover { border-color: rgba(var(--dark-panel-rgb), 0.40); }

	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	textarea {
		width: 100%;
		background: rgba(var(--dark-panel-rgb), 0.04);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.18);
		color: var(--clr-dark-text);
		font-family: var(--font-prose);
		font-size: 1rem;
		line-height: 1.9;
		padding: 0.5rem;
		resize: vertical;
		outline: none;
	}
	textarea:focus { border-color: rgba(var(--dark-panel-rgb), 0.35); }

	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	button {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button:hover:not(:disabled) { color: var(--clr-dark-text); border-color: rgba(var(--dark-panel-rgb), 0.32); }
	button.save {
		background: rgba(var(--dark-panel-rgb), 0.06);
		border-color: rgba(var(--dark-panel-rgb), 0.25);
		color: var(--clr-dark-text);
	}
	button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

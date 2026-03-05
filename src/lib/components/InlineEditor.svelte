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
		if (!adminState.editMode) return;
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
{:else if adminState.editMode}
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
		border-bottom: 1px dashed rgba(200, 150, 60, 0.3);
		transition: border-color 0.15s;
	}
	.editable:hover { border-color: rgba(200, 150, 60, 0.6); }

	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	textarea {
		width: 100%;
		background: rgba(200, 150, 60, 0.04);
		border: 1px solid rgba(200, 150, 60, 0.25);
		color: #c0b088;
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1rem;
		line-height: 1.9;
		padding: 0.5rem;
		resize: vertical;
		outline: none;
	}
	textarea:focus { border-color: rgba(200, 150, 60, 0.5); }

	.actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	button {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.2);
		color: #6a5a40;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button:hover:not(:disabled) { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }
	button.save {
		background: rgba(200, 150, 60, 0.08);
		border-color: rgba(200, 150, 60, 0.35);
		color: #c8a060;
	}
	button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

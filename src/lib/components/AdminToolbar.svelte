<script lang="ts">
	import { adminState, bookFormState } from '$lib/admin/state.svelte';
</script>

{#if adminState.active}
	<div class="toolbar">
		<span class="label">⊙ admin</span>
		<button onclick={() => bookFormState.openAdd()}>+ add</button>
		<button
			class:active={adminState.editMode}
			onclick={() => adminState.toggleEditMode()}
		>✎ edit</button>
		<button onclick={() => adminState.logout()}>× logout</button>
	</div>
{/if}

<style>
	.toolbar {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: #c8a060;
		opacity: 0.7;
		margin-right: 0.2rem;
	}

	button {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.2);
		color: #6a5a40;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button:hover { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }
	button.active {
		color: #c8a060;
		background: rgba(200, 150, 60, 0.08);
		border-color: rgba(200, 150, 60, 0.4);
	}

	@media (max-width: 480px) {
		.label { display: none; }
		button { font-size: 0.55rem; padding: 0.2rem 0.4rem; }
	}
</style>

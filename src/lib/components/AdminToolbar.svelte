<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';

	async function handleLogout() {
		await adminState.logout();
	}

	async function handleSync() {
		await writeQueue.flush();
	}
</script>

{#if adminState.active}
	<div class="toolbar">
		<span class="label">⊙ admin</span>
		{#if writeQueue.status === 'dirty'}
			<button class="sync-btn dirty" onclick={handleSync}>● sync</button>
		{:else if writeQueue.status === 'saving'}
			<button class="sync-btn saving" disabled>syncing…</button>
		{:else if writeQueue.status === 'error'}
			<button class="sync-btn error" onclick={handleSync} title={writeQueue.error}>⚠ retry</button>
		{/if}
		<button onclick={handleLogout}>× logout</button>
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
	button:hover:not(:disabled) { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }
	button:disabled { opacity: 0.5; cursor: not-allowed; }

	.sync-btn.dirty {
		color: #c8a060;
		border-color: rgba(200, 150, 60, 0.4);
	}
	.sync-btn.saving {
		color: #6a5a40;
		border-color: rgba(200, 150, 60, 0.15);
	}
	.sync-btn.error {
		color: #c07050;
		border-color: rgba(190, 80, 60, 0.45);
	}
	.sync-btn.error:hover { color: #d08060; border-color: rgba(190, 80, 60, 0.7); }

	@media (max-width: 480px) {
		.label { display: none; }
		button { font-size: 0.55rem; padding: 0.2rem 0.4rem; }
	}
</style>

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
		color: var(--clr-text-muted);
		opacity: 0.8;
		margin-right: 0.2rem;
	}

	button {
		background: none;
		border: 1px solid var(--glass-border);
		color: var(--clr-text-secondary);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button:hover:not(:disabled) { color: var(--clr-text-primary); border-color: var(--glass-border); }
	button:disabled { opacity: 0.5; cursor: not-allowed; }

	.sync-btn.dirty {
		color: var(--clr-text-primary);
		border-color: var(--glass-border);
	}
	.sync-btn.saving {
		color: var(--clr-text-muted);
	}
	.sync-btn.error {
		color: var(--clr-danger);
		border-color: rgba(190, 80, 60, 0.45);
	}
	.sync-btn.error:hover { color: var(--clr-danger); border-color: rgba(190, 80, 60, 0.7); }

	@media (max-width: 480px) {
		.label { display: none; }
		button { font-size: 0.55rem; padding: 0.2rem 0.4rem; }
	}
</style>

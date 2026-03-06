<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import ThemePanel from '$lib/components/ThemePanel.svelte';

	let themePanelOpen = $state(false);

	async function handleLogout() {
		await adminState.logout();
	}

	async function handleSync() {
		await writeQueue.flush();
	}

	function handleClickOutside(node: HTMLElement) {
		function onClick(e: MouseEvent) {
			if (!node.contains(e.target as Node)) themePanelOpen = false;
		}
		document.addEventListener('click', onClick, true);
		return { destroy() { document.removeEventListener('click', onClick, true); } };
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

		<button class="edit-btn" class:active={adminState.editMode} onclick={() => adminState.toggleEditMode()}>
			{adminState.editMode ? '✎ editing' : '✎ edit'}
		</button>

		<!-- Theme palette picker -->
		<div class="theme-wrapper" use:handleClickOutside>
			<button
				class="theme-btn"
				class:active={themePanelOpen}
				onclick={() => (themePanelOpen = !themePanelOpen)}
				aria-expanded={themePanelOpen}
				aria-label="Toggle theme palette"
			>⊹ theme</button>
			{#if themePanelOpen}
				<ThemePanel />
			{/if}
		</div>

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
		color: var(--clr-text);
		opacity: 0.8;
		margin-right: 0.2rem;
	}

	button {
		background: none;
		border: 1px solid var(--glass-border);
		color: var(--clr-text);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		transition: all var(--t-ui);
		opacity: 0.7;
	}
	button:hover:not(:disabled) { opacity: 1; }
	button:disabled { opacity: 0.4; cursor: not-allowed; }

	.sync-btn.dirty  { opacity: 1; }
	.sync-btn.saving { opacity: 0.5; }
	.sync-btn.error  {
		color: var(--clr-danger);
		border-color: rgba(190, 80, 60, 0.45);
		opacity: 1;
	}
	.sync-btn.error:hover { border-color: rgba(190, 80, 60, 0.7); }

	.edit-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	/* Theme button wrapper — positions the dropdown panel */
	.theme-wrapper {
		position: relative;
	}

	.theme-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	@media (max-width: 480px) {
		.label { display: none; }
		button { font-size: 0.55rem; padding: 0.2rem 0.4rem; }
	}
</style>

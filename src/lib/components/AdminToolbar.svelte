<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import ThemePanel from '$lib/components/ThemePanel.svelte';

	let themePanelOpen = $state(false);
	let logoutConfirmOpen = $state(false);

	async function confirmLogout() {
		logoutConfirmOpen = false;
		await adminState.logout();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') logoutConfirmOpen = false;
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

<svelte:window onkeydown={handleKeydown} />

{#if logoutConfirmOpen}
	<div class="logout-backdrop" role="presentation" onclick={() => logoutConfirmOpen = false}></div>
	<div class="logout-modal" role="dialog" aria-modal="true" aria-label="Confirm logout">
		<p class="logout-title">log out?</p>
		{#if writeQueue.isDirty}
			<p class="logout-body">you have unsynced changes. they will be lost.</p>
		{/if}
		<div class="logout-actions">
			<button onclick={() => logoutConfirmOpen = false}>cancel</button>
			<button class="confirm-btn" onclick={confirmLogout}>× logout</button>
		</div>
	</div>
{/if}

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

		<button onclick={() => logoutConfirmOpen = true}>× logout</button>
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

	/* ── logout confirmation modal ─────────────────────────── */
	.logout-backdrop {
		position: fixed; inset: 0; z-index: 400;
		background: var(--backdrop-overlay);
	}
	.logout-modal {
		position: fixed; top: 50%; left: 50%;
		transform: translate(-50%, -50%);
		z-index: 401;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid var(--glass-border-dark);
		padding: 1.6rem 1.8rem;
		width: min(300px, 90vw);
		display: flex; flex-direction: column; gap: 0.9rem;
	}
	.logout-title {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase;
		color: var(--clr-dark-text); margin: 0;
	}
	.logout-body {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem; line-height: 1.6; letter-spacing: 0.03em;
		color: var(--clr-danger); margin: 0;
	}
	.logout-actions {
		display: flex; gap: 0.5rem; justify-content: flex-end;
		padding-top: 0.6rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.logout-actions button {
		background: none; border: 1px solid rgba(255, 255, 255, 0.15);
		color: var(--clr-dark-text);
		font-size: 0.6rem; letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem; cursor: pointer; transition: all var(--t-ui);
	}
	.logout-actions button:hover { border-color: rgba(255, 255, 255, 0.35); opacity: 1; }
	.confirm-btn { color: var(--clr-danger) !important; border-color: rgba(190, 80, 60, 0.35) !important; }
	.confirm-btn:hover { border-color: rgba(190, 80, 60, 0.65) !important; }
</style>

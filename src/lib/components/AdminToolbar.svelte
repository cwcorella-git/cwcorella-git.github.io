<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import ThemePanel from '$lib/components/ThemePanel.svelte';

	let { onLogoutRequest }: { onLogoutRequest: () => void } = $props();

	let adminMenuOpen = $state(false);

	async function handleSync() {
		await writeQueue.flush();
	}

	function handleClickOutside(node: HTMLElement) {
		function onClick(e: MouseEvent) {
			if (!node.contains(e.target as Node)) adminMenuOpen = false;
		}
		document.addEventListener('click', onClick, true);
		return { destroy() { document.removeEventListener('click', onClick, true); } };
	}
</script>

{#if adminState.active}
	<div class="toolbar">
		{#if writeQueue.status === 'dirty'}
			<button class="sync-btn dirty" onclick={handleSync}>● <span class="btn-label">sync</span></button>
		{:else if writeQueue.status === 'saving'}
			<button class="sync-btn saving" disabled>… <span class="btn-label">syncing</span></button>
		{:else if writeQueue.status === 'error'}
			<button class="sync-btn error" onclick={handleSync} title={writeQueue.error}>⚠ <span class="btn-label">retry</span></button>
		{/if}

		<!-- Admin menu -->
		<div class="admin-menu-wrapper" use:handleClickOutside>
			<button
				class="admin-menu-btn"
				class:active={adminMenuOpen}
				onclick={() => (adminMenuOpen = !adminMenuOpen)}
				aria-expanded={adminMenuOpen}
				aria-label="Admin menu"
			>⊙</button>
			{#if adminMenuOpen}
				<div class="admin-menu-panel">
					<span class="menu-label">admin</span>
					<ThemePanel />
					<button class="menu-item logout" onclick={() => { adminMenuOpen = false; onLogoutRequest(); }}>logout</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.toolbar {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
	}

	button {
		background: none;
		border: 1px solid var(--glass-border);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		transition: all var(--t-ui);
		opacity: 0.7;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		line-height: 1;
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

	/* Admin menu dropdown */
	.admin-menu-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.admin-menu-btn {
		padding: 0.25rem 0.45rem;
		font-size: 0.7rem;
	}

	.admin-menu-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	.admin-menu-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.4rem;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 0.6rem;
		border-radius: 3px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 150px;
		z-index: 100;
	}

	.menu-label {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		opacity: 0.6;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgba(var(--dark-panel-rgb), 0.15);
	}

	.menu-item {
		padding: 0.25rem 0.4rem;
		font-size: 0.55rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		border: none;
		opacity: 0.7;
		gap: 0;
	}

	.menu-item:hover {
		opacity: 1;
	}

	.menu-item.logout {
		color: var(--clr-danger);
	}

	/* Icon-only at narrow widths */
	@media (max-width: 580px) {
		.btn-label { display: none; }
		button { padding: 0.25rem 0.5rem; }
		.toolbar { gap: 0.35rem; }
	}
</style>

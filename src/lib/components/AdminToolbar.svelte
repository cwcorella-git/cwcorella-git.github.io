<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import ThemePanel from './ThemePanel.svelte';

	let { onLogoutRequest }: { onLogoutRequest: () => void } = $props();

	let adminMenuOpen = $state(false);
	let themePanelOpen = $state(false);

	async function handleSync() {
		await writeQueue.flush();
	}

	function handleClickOutside(node: HTMLElement) {
		function onClick(e: MouseEvent) {
			if (!node.contains(e.target as Node)) {
				adminMenuOpen = false;
				themePanelOpen = false;
			}
		}
		document.addEventListener('click', onClick, true);
		return { destroy() { document.removeEventListener('click', onClick, true); } };
	}
</script>

{#if adminState.active}
	<div class="toolbar" use:handleClickOutside>
		{#if writeQueue.status === 'dirty'}
			<button class="sync-btn dirty" onclick={handleSync}>● <span class="btn-label">sync</span></button>
		{:else if writeQueue.status === 'saving'}
			<button class="sync-btn saving" disabled>… <span class="btn-label">syncing</span></button>
		{:else if writeQueue.status === 'error'}
			<button class="sync-btn error" onclick={handleSync} title={writeQueue.error}>⚠ <span class="btn-label">retry</span></button>
		{/if}

		<!-- Theme button -->
		<div class="theme-wrapper">
			<button
				class="theme-btn"
				class:active={themePanelOpen}
				onclick={() => (themePanelOpen = !themePanelOpen)}
				aria-expanded={themePanelOpen}
				aria-label="Theme palette"
			>◐ <span class="btn-label">theme</span></button>
			{#if themePanelOpen}
				<ThemePanel />
			{/if}
		</div>

		<!-- Admin menu -->
		<div class="admin-menu-wrapper">
			<button
				class="admin-menu-btn"
				class:active={adminMenuOpen}
				onclick={() => (adminMenuOpen = !adminMenuOpen)}
				aria-expanded={adminMenuOpen}
				aria-label="Admin"
			>⊙ <span class="btn-label">admin</span></button>
			{#if adminMenuOpen}
				<div class="admin-menu-panel">
					<button class="logout-btn" onclick={() => { adminMenuOpen = false; onLogoutRequest(); }}>logout</button>
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

	/* Theme button */
	.theme-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.theme-btn {
		padding: 0.25rem 0.55rem;
	}

	.theme-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	/* Admin menu dropdown */
	.admin-menu-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.admin-menu-btn {
		padding: 0.25rem 0.55rem;
	}

	.admin-menu-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	.admin-menu-panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		right: 0;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 0.5rem;
		border-radius: 2px;
		z-index: 99;
		min-width: 100px;
	}

	.logout-btn {
		padding: 0.4rem 0.5rem;
		font-size: 0.56rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--clr-danger);
		border: 1px solid rgba(var(--clr-danger), 0.3);
		background: none;
		cursor: pointer;
		transition: all 0.15s;
		opacity: 0.7;
	}

	.logout-btn:hover {
		opacity: 1;
		border-color: rgba(var(--clr-danger), 0.6);
	}

	/* Icon-only at narrow widths */
	@media (max-width: 580px) {
		.btn-label { display: none; }
		button { padding: 0.25rem 0.5rem; }
		.toolbar { gap: 0.35rem; }
	}
</style>

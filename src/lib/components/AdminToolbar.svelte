<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import { themeState, type PaletteName } from '$lib/admin/theme.svelte';

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

	function selectPalette(palette: PaletteName) {
		themeState.applyPalette(palette);
		adminMenuOpen = false;
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
					<!-- Admin section -->
					<div class="menu-section">
						<h3 class="section-label">admin</h3>
						<button class="logout-btn" onclick={() => { adminMenuOpen = false; onLogoutRequest(); }}>logout</button>
					</div>

					<!-- Palette section -->
					<div class="menu-section">
						<h3 class="section-label">palette</h3>
						<div class="palette-grid">
							<button
								class="palette-btn"
								class:active={themeState.palette === 'amber'}
								onclick={() => selectPalette('amber')}
								title="Amber"
							>
								<span class="palette-name">amber</span>
							</button>
							<button
								class="palette-btn"
								class:active={themeState.palette === 'sky'}
								onclick={() => selectPalette('sky')}
								title="Sky"
							>
								<span class="palette-name">sky</span>
							</button>
							<button
								class="palette-btn"
								class:active={themeState.palette === 'dusk'}
								onclick={() => selectPalette('dusk')}
								title="Dusk"
							>
								<span class="palette-name">dusk</span>
							</button>
							<button
								class="palette-btn"
								class:active={themeState.palette === 'neutral'}
								onclick={() => selectPalette('neutral')}
								title="Neutral"
							>
								<span class="palette-name">neutral</span>
							</button>
						</div>
					</div>
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
		margin-top: 0.6rem;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		padding: 1rem;
		border-radius: 2px;
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		width: 220px;
		z-index: 100;
	}

	.menu-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.section-label {
		font-family: var(--font-ui);
		font-size: 0.56rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		margin: 0;
		opacity: 0.65;
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

	/* Palette grid */
	.palette-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.palette-btn {
		padding: 0.5rem;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.25);
		background: none;
		color: var(--clr-dark-text);
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		opacity: 0.6;
	}

	.palette-btn:hover {
		opacity: 0.9;
		border-color: rgba(var(--dark-panel-rgb), 0.45);
	}

	.palette-btn.active {
		opacity: 1;
		border-color: rgba(var(--dark-panel-rgb), 0.65);
		background: rgba(var(--dark-panel-rgb), 0.08);
	}

	.palette-name {
		font-family: var(--font-ui);
		font-size: 0.56rem;
		letter-spacing: 0.06em;
		text-transform: lowercase;
	}

	/* Icon-only at narrow widths */
	@media (max-width: 580px) {
		.btn-label { display: none; }
		button { padding: 0.25rem 0.5rem; }
		.toolbar { gap: 0.35rem; }
	}
</style>

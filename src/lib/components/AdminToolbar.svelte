<script lang="ts">
	import { adminState, writeQueue } from '$lib/admin/state.svelte';
	import ThemePanel from '$lib/components/ThemePanel.svelte';

	let { onLogoutRequest }: { onLogoutRequest: () => void } = $props();

	let themePanelOpen = $state(false);

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
			<button class="sync-btn dirty" onclick={handleSync}>● <span class="btn-label">sync</span></button>
		{:else if writeQueue.status === 'saving'}
			<button class="sync-btn saving" disabled>… <span class="btn-label">syncing</span></button>
		{:else if writeQueue.status === 'error'}
			<button class="sync-btn error" onclick={handleSync} title={writeQueue.error}>⚠ <span class="btn-label">retry</span></button>
		{/if}

		<!-- Theme palette picker -->
		<div class="theme-wrapper" use:handleClickOutside>
			<button
				class="theme-btn"
				class:active={themePanelOpen}
				onclick={() => (themePanelOpen = !themePanelOpen)}
				aria-expanded={themePanelOpen}
				aria-label="Toggle theme palette"
			>⊹ <span class="btn-label">theme</span></button>
			{#if themePanelOpen}
				<ThemePanel />
			{/if}
		</div>

		<button onclick={onLogoutRequest}>× <span class="btn-label">logout</span></button>
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

	.label {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: var(--clr-text);
		opacity: 0.8;
		margin-right: 0.2rem;
		white-space: nowrap;
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

	/* Theme button wrapper — positions the dropdown panel */
	.theme-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	button.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	.theme-btn.active {
		opacity: 1;
		background: rgba(var(--ui-rgb), 0.10);
	}

	/* Icon-only at narrow widths */
	@media (max-width: 580px) {
		.label { display: none; }
		.btn-label { display: none; }
		button { padding: 0.25rem 0.5rem; }
		.toolbar { gap: 0.35rem; }
	}
</style>

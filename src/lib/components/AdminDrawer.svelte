<script lang="ts">
	import { adminState } from '$lib/admin/state.svelte';
	import { validatePAT } from '$lib/admin/github';
	import { toast } from '$lib/admin/toast.svelte';
	import { isUnlockDay } from '$lib/admin/tlock';

	let open = $state(false);
	let pat = $state('');
	let contentKey = $state('');
	let patError = $state('');
	let loading = $state(false);

	export function trigger() {
		if (adminState.active) return;
		if (isUnlockDay()) {
			toast.error('February 13, 2095 — this site is now a permanent archive. Admin access is closed.');
			return;
		}
		open = true;
		pat = '';
		contentKey = '';
		patError = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!pat.trim()) { patError = 'GitHub PAT is required.'; return; }
		loading = true;
		patError = '';
		try {
			const valid = await validatePAT(pat.trim());
			if (!valid) { patError = 'Invalid PAT — check token and permissions.'; return; }
			adminState.activate(pat.trim(), contentKey.trim());
			open = false;
		} catch {
			toast.error('Network error — could not validate PAT.');
		} finally {
			loading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		if (e.key === 'Tab') trapFocus(e);
	}

	function close() {
		open = false;
	}

	let dialogEl = $state<HTMLElement>();

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		const focusable = (dialogEl as HTMLElement).querySelectorAll<HTMLElement>(
			'input, button, [tabindex]:not([tabindex="-1"])'
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first) { e.preventDefault(); last.focus(); }
		} else {
			if (document.activeElement === last) { e.preventDefault(); first.focus(); }
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div class="drawer" role="dialog" aria-modal="true" aria-label="Admin login" bind:this={dialogEl}>
		<div class="drawer-header">
			<span class="drawer-title">admin</span>
			<button class="close-btn" onclick={close} aria-label="Close">×</button>
		</div>
		<form onsubmit={submit}>
			<label>
				<span>GitHub PAT</span>
				<input
					type="password"
					autocomplete="current-password"
					bind:value={pat}
					placeholder="ghp_..."
					disabled={loading}
				/>
			</label>
			<label>
				<span>Content key</span>
				<input
					type="password"
					autocomplete="off"
					bind:value={contentKey}
					placeholder="passphrase for encrypted docs"
					disabled={loading}
				/>
			</label>
			{#if patError}
				<p class="error">{patError}</p>
			{/if}
			<button type="submit" class="submit-btn" disabled={loading}>
				{loading ? 'verifying…' : 'unlock'}
			</button>
		</form>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 400;
		background: var(--backdrop-overlay);
	}

	.drawer {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 401;
		background: var(--glass-bg-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border: 1px solid var(--glass-border-dark);
		padding: 1.8rem;
		width: min(360px, 90vw);
	}

	.drawer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.4rem;
	}

	.drawer-title {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--clr-dark-text);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		min-width: 44px;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s;
	}
	.close-btn:hover { color: var(--clr-dark-text); }

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label span {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
	}

	label input {
		background: rgba(var(--dark-panel-rgb), 0.04);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		outline: none;
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		padding: 0.5rem 0.65rem;
		transition: border-color 0.15s;
	}
	label input:focus { border-color: rgba(var(--dark-panel-rgb), 0.32); }

	.error {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--clr-danger);
		margin: 0;
	}

	.submit-btn {
		background: rgba(var(--dark-panel-rgb), 0.08);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.25);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.55rem 1rem;
		cursor: pointer;
		transition: background 0.15s;
		align-self: flex-end;
	}
	.submit-btn:hover:not(:disabled) { background: rgba(var(--dark-panel-rgb), 0.14); }
	.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

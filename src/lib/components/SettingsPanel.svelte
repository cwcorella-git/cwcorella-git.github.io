<script lang="ts">
	import { adminState, writeQueue, type KeyMode } from '$lib/admin/state.svelte';
	import { validatePAT } from '$lib/admin/github';
	import { importRawKey } from '$lib/admin/crypto';
	import { toast } from '$lib/admin/toast.svelte';

	let { onLogoutRequest }: { onLogoutRequest: () => void } = $props();

	// ── PAT section ───────────────────────────────────────────────────────────
	let patValue = $state(adminState.pat);
	let patSaving = $state(false);
	let patError = $state('');

	async function savePAT() {
		const newPat = patValue.trim();
		if (!newPat) { patError = 'PAT is required.'; return; }
		patSaving = true;
		patError = '';
		try {
			const valid = await validatePAT(newPat);
			if (!valid) { patError = 'Invalid PAT — check token and permissions.'; return; }
			adminState.updatePAT(newPat);
			toast.success('PAT updated.');
		} catch {
			patError = 'Network error — could not validate PAT.';
		} finally {
			patSaving = false;
		}
	}

	// ── Content key section ───────────────────────────────────────────────────
	let keyValue = $state(adminState.contentKey);
	let keyMode = $state<KeyMode>(adminState.keyMode);
	let keySaving = $state(false);
	let keyError = $state('');

	function switchKeyMode(mode: KeyMode) {
		if (mode === keyMode) return;
		keyMode = mode;
		keyValue = '';  // clear — a passphrase is not a raw key and vice versa
		keyError = '';
	}

	async function saveKey() {
		const newKey = keyValue.trim();
		if (!newKey) { keyError = 'Content key is required.'; return; }
		if (keyMode === 'rawkey') {
			const ck = await importRawKey(newKey);
			if (!ck) { keyError = 'Invalid raw key — must be 64 hex chars or 44-char base64 (256 bits).'; return; }
		}
		keySaving = true;
		keyError = '';
		try {
			await adminState.updateContentKey(newKey, keyMode);
			toast.success('Content key updated.');
		} finally {
			keySaving = false;
		}
	}
</script>

<div class="panel" role="dialog" aria-label="Admin settings">
	<p class="panel-label">settings</p>

	<!-- PAT -->
	<section class="section">
		<p class="section-label">github pat</p>
		<div class="field-row">
			<input
				class="field-input"
				type="password"
				autocomplete="off"
				bind:value={patValue}
				placeholder="ghp_..."
				disabled={patSaving}
			/>
			<button class="action-btn" onclick={savePAT} disabled={patSaving}>
				{patSaving ? '…' : 'update'}
			</button>
		</div>
		{#if patError}<p class="field-error">{patError}</p>{/if}
	</section>

	<!-- Content key -->
	<section class="section">
		<p class="section-label">content key</p>
		<div class="mode-toggle">
			<button
				class="mode-btn"
				class:active={keyMode === 'passphrase'}
				onclick={() => switchKeyMode('passphrase')}
			>passphrase</button>
			<button
				class="mode-btn"
				class:active={keyMode === 'rawkey'}
				onclick={() => switchKeyMode('rawkey')}
			>raw key</button>
		</div>
		<div class="field-row">
			<input
				class="field-input"
				type="password"
				autocomplete="off"
				bind:value={keyValue}
				placeholder={keyMode === 'rawkey' ? '64 hex or 44-char base64' : 'passphrase'}
				disabled={keySaving}
			/>
			<button class="action-btn" onclick={saveKey} disabled={keySaving}>
				{keySaving ? '…' : 'update'}
			</button>
		</div>
		{#if keyError}<p class="field-error">{keyError}</p>{/if}
	</section>

	<!-- Logout -->
	<section class="section section-logout">
		<button class="logout-btn" onclick={onLogoutRequest}>logout</button>
	</section>
</div>

<style>
	.panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		right: 0;
		z-index: 100;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		padding: 0.85rem 0.9rem;
		width: 240px;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.panel-label {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		opacity: 0.5;
		margin: 0 0 0.1rem;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.section-label {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		opacity: 0.45;
		margin: 0;
	}

	.field-row {
		display: flex;
		gap: 0.4rem;
		align-items: stretch;
	}

	.field-input {
		flex: 1;
		min-width: 0;
		background: rgba(var(--dark-panel-rgb), 0.04);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		outline: none;
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.62rem;
		padding: 0.35rem 0.5rem;
		transition: border-color 0.15s;
	}
	.field-input:focus { border-color: rgba(var(--dark-panel-rgb), 0.32); }
	.field-input:disabled { opacity: 0.5; }

	.action-btn {
		background: rgba(var(--dark-panel-rgb), 0.08);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.20);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		padding: 0 0.6rem;
		cursor: pointer;
		transition: background 0.12s;
		white-space: nowrap;
		opacity: 0.75;
	}
	.action-btn:hover:not(:disabled) {
		background: rgba(var(--dark-panel-rgb), 0.14);
		opacity: 1;
	}
	.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.field-error {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		color: var(--clr-danger);
		margin: 0;
	}

	.mode-toggle {
		display: flex;
		gap: 0;
	}

	.mode-btn {
		flex: 1;
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.54rem;
		letter-spacing: 0.07em;
		padding: 0.28rem 0;
		cursor: pointer;
		opacity: 0.45;
		transition: all 0.1s;
	}
	.mode-btn + .mode-btn { border-left: none; }
	.mode-btn:hover { opacity: 0.75; }
	.mode-btn.active {
		opacity: 1;
		background: rgba(var(--dark-panel-rgb), 0.10);
		border-color: rgba(var(--dark-panel-rgb), 0.28);
	}

	.section-logout {
		border-top: 1px solid rgba(var(--dark-panel-rgb), 0.12);
		padding-top: 0.7rem;
		margin-top: 0.1rem;
	}

	.logout-btn {
		background: none;
		border: 1px solid rgba(190, 80, 60, 0.30);
		color: var(--clr-danger);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.35rem 0.65rem;
		cursor: pointer;
		opacity: 0.7;
		transition: all 0.12s;
		align-self: flex-start;
	}
	.logout-btn:hover {
		opacity: 1;
		border-color: rgba(190, 80, 60, 0.60);
	}
</style>

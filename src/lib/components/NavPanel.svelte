<script lang="ts">
	import { navState } from '$lib/nav/navState.svelte';
	import { adminState } from '$lib/admin/state.svelte';
	import { audienceEditable, shownEditable, isGoingPublic, type NavItem, type NavAudience } from '$lib/nav/navLogic';
	import { toast } from '$lib/admin/toast.svelte';

	// The one item awaiting a private→public confirmation (null = none pending).
	let pendingPublic = $state<NavItem | null>(null);

	function chooseAudience(item: NavItem, next: NavAudience) {
		if (!audienceEditable(item) || item.audience === next) return;
		if (isGoingPublic(item.audience, next)) {
			pendingPublic = item; // gate exposure behind an explicit yes
			return;
		}
		navState.setAudience(item.id, next);
	}

	function confirmPublic() {
		if (pendingPublic) navState.setAudience(pendingPublic.id, 'public');
		pendingPublic = null;
	}

	async function publish() {
		try {
			await navState.publish();
			toast.success('nav published — live after redeploy (~1–2 min)');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'publish failed');
		}
	}
</script>

<div class="panel" role="dialog" aria-label="Navigation bar settings">
	<p class="panel-label">nav bar</p>

	<div class="rows">
		{#each navState.items as item (item.id)}
			<div class="row">
				<button
					class="show-btn"
					class:on={item.shown}
					disabled={!shownEditable(item)}
					onclick={() => navState.toggleShown(item.id)}
					title={item.shown ? 'shown — click to hide' : 'hidden — click to show'}
					aria-label={item.shown ? 'hide ' + item.label : 'show ' + item.label}
				>{item.shown ? '●' : '○'}</button>

				<span class="label" class:muted={!item.shown}>{item.label}</span>

				<div class="aud-toggle" class:locked={!audienceEditable(item)}>
					<button
						class="aud-btn"
						class:active={item.audience === 'admin'}
						disabled={!audienceEditable(item)}
						onclick={() => chooseAudience(item, 'admin')}
					>admin</button>
					<button
						class="aud-btn"
						class:active={item.audience === 'public'}
						disabled={!audienceEditable(item)}
						onclick={() => chooseAudience(item, 'public')}
					>public</button>
					{#if item.adminLocked}<span class="lock" title="page is admin-only — a public link would just redirect visitors">🔒</span>{/if}
					{#if item.pinned}<span class="lock" title="site home — always shown & public">📌</span>{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if pendingPublic}
		<div class="confirm">
			<p class="confirm-text">make “{pendingPublic.label}” public? everyone visiting cwcorella.com will see this tab.</p>
			<div class="confirm-actions">
				<button class="c-cancel" onclick={() => pendingPublic = null}>no</button>
				<button class="c-ok" onclick={confirmPublic}>yes, make public</button>
			</div>
		</div>
	{/if}

	<div class="footer">
		<button class="ghost" disabled={!navState.dirty || navState.publishing} onclick={() => navState.reset()}>reset</button>
		<button
			class="publish"
			disabled={!navState.dirty || navState.publishing || !adminState.pat}
			onclick={publish}
			title={!adminState.pat ? 'set a github PAT in settings first' : 'commit nav.json → redeploy'}
		>{navState.publishing ? '…' : 'publish nav'}</button>
	</div>
	{#if !adminState.pat}<p class="hint">needs a github PAT (settings ⊙) to publish</p>{/if}
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
		width: 268px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.panel-label {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		opacity: 0.5;
		margin: 0;
	}

	.rows { display: flex; flex-direction: column; gap: 0.4rem; }

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.show-btn {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		color: var(--clr-dark-text);
		font-size: 0.55rem;
		line-height: 1;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
		opacity: 0.55;
		transition: opacity 0.12s;
		flex-shrink: 0;
	}
	.show-btn.on { opacity: 0.9; }
	.show-btn:hover:not(:disabled) { opacity: 1; }
	.show-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	.label {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--clr-dark-text);
	}
	.label.muted { opacity: 0.4; text-decoration: line-through; }

	.aud-toggle { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }

	.aud-btn {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.5rem;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
		opacity: 0.45;
		transition: all 0.1s;
	}
	.aud-btn + .aud-btn { border-left: none; }
	.aud-btn:hover:not(:disabled) { opacity: 0.8; }
	.aud-btn.active {
		opacity: 1;
		background: rgba(var(--dark-panel-rgb), 0.12);
		border-color: rgba(var(--dark-panel-rgb), 0.30);
	}
	.aud-toggle.locked .aud-btn { cursor: not-allowed; }
	.aud-toggle.locked .aud-btn.active { opacity: 0.7; }
	.aud-btn:disabled:not(.active) { opacity: 0.25; }

	.lock { font-size: 0.6rem; opacity: 0.6; margin-left: 0.05rem; }

	.confirm {
		border: 1px solid rgba(var(--dark-panel-rgb), 0.20);
		background: rgba(var(--dark-panel-rgb), 0.06);
		padding: 0.55rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.confirm-text {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		line-height: 1.5;
		letter-spacing: 0.02em;
		color: var(--clr-dark-text);
		margin: 0;
	}
	.confirm-actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
	.c-cancel, .c-ok {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.22);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.56rem;
		letter-spacing: 0.05em;
		padding: 0.28rem 0.55rem;
		cursor: pointer;
		transition: all 0.12s;
	}
	.c-cancel:hover { border-color: rgba(var(--dark-panel-rgb), 0.45); }
	.c-ok { color: var(--clr-danger); border-color: rgba(190, 80, 60, 0.35); }
	.c-ok:hover { border-color: var(--clr-danger); }

	.footer {
		display: flex;
		gap: 0.4rem;
		justify-content: flex-end;
		padding-top: 0.6rem;
		border-top: 1px solid rgba(var(--dark-panel-rgb), 0.12);
	}
	.ghost, .publish {
		background: rgba(var(--dark-panel-rgb), 0.08);
		border: 1px solid rgba(var(--dark-panel-rgb), 0.20);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		transition: all 0.12s;
		opacity: 0.8;
	}
	.ghost:hover:not(:disabled), .publish:hover:not(:disabled) {
		opacity: 1;
		background: rgba(var(--dark-panel-rgb), 0.14);
	}
	.ghost:disabled, .publish:disabled { opacity: 0.35; cursor: not-allowed; }

	.hint {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.04em;
		color: var(--clr-dark-text);
		opacity: 0.4;
		margin: 0;
		text-align: right;
	}
</style>

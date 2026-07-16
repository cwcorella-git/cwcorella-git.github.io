<script lang="ts">
	import { navState } from '$lib/nav/navState.svelte';
	import { adminState } from '$lib/admin/state.svelte';
	import { audienceEditable, shownEditable, canMove, isGoingPublic, type NavItem, type NavAudience } from '$lib/nav/navLogic';
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

	// Hover explanation for why an item's audience can't be changed.
	function lockReason(item: NavItem): string {
		if (item.pinned) return 'site home — always shown and public';
		if (item.adminLocked) return 'this page is admin-only — a public link would just redirect visitors, so it can’t be made public';
		return '';
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
			{@const locked = !audienceEditable(item)}
			<div class="row">
				<div class="reorder">
					<button class="arrow" disabled={!canMove(navState.items, item.id, 'up')}
						onclick={() => navState.move(item.id, 'up')} aria-label="move {item.label} up" title="move up">▲</button>
					<button class="arrow" disabled={!canMove(navState.items, item.id, 'down')}
						onclick={() => navState.move(item.id, 'down')} aria-label="move {item.label} down" title="move down">▼</button>
				</div>

				<button
					class="show-btn"
					class:on={item.shown}
					disabled={!shownEditable(item)}
					onclick={() => navState.toggleShown(item.id)}
					title={item.pinned ? 'site home — always shown' : item.shown ? 'shown — click to hide' : 'hidden — click to show'}
					aria-label={item.shown ? 'hide ' + item.label : 'show ' + item.label}
				>{item.shown ? '●' : '○'}</button>

				<span class="label" class:muted={!item.shown}>{item.label}</span>

				<div class="aud-toggle" class:locked title={lockReason(item)}>
					<button
						class="aud-btn"
						class:active={item.audience === 'admin'}
						class:struck={locked && item.audience !== 'admin'}
						disabled={locked}
						onclick={() => chooseAudience(item, 'admin')}
					>admin</button>
					<button
						class="aud-btn"
						class:active={item.audience === 'public'}
						class:struck={locked && item.audience !== 'public'}
						disabled={locked}
						onclick={() => chooseAudience(item, 'public')}
					>public</button>
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
		<span class="dirty-note">{navState.dirty ? 'unsaved changes' : 'no changes'}</span>
		<div class="footer-btns">
			<button class="ghost" disabled={!navState.dirty || navState.publishing} onclick={() => navState.reset()}>reset</button>
			<button
				class="publish"
				disabled={!navState.dirty || navState.publishing || !adminState.pat}
				onclick={publish}
				title={!adminState.pat ? 'set a github PAT in settings first' : 'save & publish nav.json → redeploy'}
			>{navState.publishing ? '…' : 'save & publish'}</button>
		</div>
	</div>
	{#if navState.dirty && !adminState.pat}<p class="hint">needs a github PAT (settings ⊙) to publish</p>{/if}
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
		width: 288px;
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

	.row { display: flex; align-items: center; gap: 0.5rem; }

	.reorder { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
	.arrow {
		background: none;
		border: none;
		color: var(--clr-dark-text);
		font-size: 0.42rem;
		line-height: 0.9;
		padding: 0 0.15rem;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.12s;
	}
	.arrow:hover:not(:disabled) { opacity: 1; }
	.arrow:disabled { opacity: 0.15; cursor: default; }

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

	.aud-toggle { display: flex; align-items: center; flex-shrink: 0; }

	.aud-btn {
		background: none;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.15);
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.5rem;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.4rem;
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
	/* An unavailable option (locked route can't be public; home can't be admin) */
	.aud-btn.struck {
		text-decoration: line-through;
		opacity: 0.3;
		cursor: not-allowed;
	}
	.aud-toggle.locked { cursor: help; }

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
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid rgba(var(--dark-panel-rgb), 0.12);
	}
	.dirty-note {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.06em;
		color: var(--clr-dark-text);
		opacity: 0.45;
	}
	.footer-btns { display: flex; gap: 0.4rem; }
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

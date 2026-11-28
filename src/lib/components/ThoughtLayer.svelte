<script lang="ts">
	import { onMount, tick } from 'svelte';
	import '$lib/styles/popups.css';
	import { adminState } from '$lib/admin/state.svelte';
	import { themeState } from '$lib/admin/theme.svelte';
	import { toast } from '$lib/admin/toast.svelte';
	import { thoughtsState, type Thought } from '$lib/thoughts/thoughtsState.svelte';
	import { chanceWithin, pickIndex } from '$lib/thoughts/thoughtLogic';

	// ── load / forget ───────────────────────────────────────────────────────
	$effect(() => {
		if (adminState.active) thoughtsState.ensureLoaded();
		else thoughtsState.clear();
	});

	// ── write ───────────────────────────────────────────────────────────────
	let text = $state('');
	let box: HTMLTextAreaElement | undefined = $state();

	$effect(() => {
		if (thoughtsState.composing) tick().then(() => box?.focus());
	});

	async function letGo() {
		const ok = await thoughtsState.add(text);
		if (ok) { text = ''; thoughtsState.close(); toast.success('let go'); }
	}
	function boxKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { e.stopPropagation(); thoughtsState.close(); }
		else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); letGo(); }
	}
	function backdrop() { if (!text.trim()) thoughtsState.close(); }

	// ink hides the garden, so there are no rocks: any click that is not on
	// something interactive opens the box instead.
	const INTERACTIVE = 'a,button,input,textarea,select,label,summary,[role=button],[role=dialog],[role=presentation],[contenteditable],[data-no-thought]';
	function onWindowClick(e: MouseEvent) {
		if (themeState.active !== 'ink' || !adminState.active || thoughtsState.composing) return;
		if (e.button !== 0 || e.defaultPrevented) return;
		const el = e.target as Element | null;
		if (!el || el.closest(INTERACTIVE)) return;
		if (window.getSelection()?.toString()) return; // finishing a text selection
		thoughtsState.open();
	}

	// ── float back ──────────────────────────────────────────────────────────
	const TICK_S = 5;       // how often the dice are rolled
	const SHOW_MS = 18_000; // how long one stays
	let shown = $state<{ thought: Thought; x: number; y: number } | null>(null);
	let last = -1;

	function roll() {
		if (shown || document.hidden || thoughtsState.composing) return;
		const items = thoughtsState.items;
		if (Math.random() >= chanceWithin(items.length, TICK_S)) return;
		const i = pickIndex(items.length, Math.random, last);
		if (i < 0) return;
		last = i;
		shown = { thought: items[i], x: 10 + Math.random() * 55, y: 22 + Math.random() * 48 };
		setTimeout(() => { shown = null; }, SHOW_MS);
	}

	onMount(() => {
		const id = setInterval(() => { if (adminState.active) roll(); }, TICK_S * 1000);
		return () => clearInterval(id);
	});
</script>

<svelte:window onclick={onWindowClick} />

{#if shown}
	<p class="floater" data-glass style="left:{shown.x}vw; top:{shown.y}vh; --show:{SHOW_MS}ms" aria-live="off">{shown.thought.text}</p>
{/if}

{#if thoughtsState.composing}
	<div class="tb-backdrop" role="presentation" onclick={backdrop}></div>
	<div class="tb popup-glass" role="dialog" aria-modal="true" aria-label="Write a thought">
		<textarea bind:this={box} bind:value={text} onkeydown={boxKey} rows="6" placeholder="put it down here…" spellcheck="true"></textarea>
		<div class="tb-actions">
			<span class="tb-hint">ctrl+enter</span>
			<button type="button" onclick={() => thoughtsState.close()}>keep it</button>
			<button type="button" class="go" onclick={letGo} disabled={!text.trim()}>let go</button>
		</div>
	</div>
{/if}

<style>
	.floater {
		position: fixed;
		z-index: 40;
		max-width: min(28rem, 80vw);
		margin: 0;
		padding: 0.9rem 1.2rem;
		border-radius: 1rem;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 1rem;
		line-height: 1.7;
		white-space: pre-wrap;
		pointer-events: none;
		opacity: 0;
		animation: drift var(--show) ease-in-out forwards;
	}
	@keyframes drift {
		0%   { opacity: 0; transform: translateY(10px); }
		20%  { opacity: 1; }
		80%  { opacity: 1; }
		100% { opacity: 0; transform: translateY(-26px); }
	}
	@media (prefers-reduced-motion: reduce) {
		.floater { animation-name: fade; }
		@keyframes fade { 0%, 100% { opacity: 0; } 20%, 80% { opacity: 1; } }
	}

	.tb-backdrop { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.25); }
	.tb {
		position: fixed;
		z-index: 91;
		left: 50%; top: 50%;
		transform: translate(-50%, -50%);
		width: min(34rem, 92vw);
		padding: 1rem;
		display: flex; flex-direction: column; gap: 0.7rem;
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		background: transparent;
		color: inherit;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.38);
		padding: 0.7rem;
		font: inherit;
		font-size: 1rem;
		line-height: 1.7;
	}
	textarea:focus { outline: none; border-color: var(--clr-dark-text); }
	.tb-actions { display: flex; align-items: center; gap: 0.5rem; justify-content: flex-end; }
	.tb-hint { margin-right: auto; font-size: 0.65rem; letter-spacing: 0.08em; opacity: 0.6; }
	button {
		background: none; color: inherit; cursor: pointer;
		border: 1px solid rgba(var(--dark-panel-rgb), 0.38);
		font: inherit; font-size: 0.7rem; letter-spacing: 0.08em;
		padding: 0.4rem 0.9rem;
	}
	button:hover:not(:disabled) { border-color: var(--clr-dark-text); }
	button:disabled { opacity: 0.4; cursor: default; }
</style>

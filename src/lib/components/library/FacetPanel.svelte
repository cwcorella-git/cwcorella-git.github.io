<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		glyph: string;
		label: string; // '' = unset → glyph only (+ restLabel if given), no .set styling
		restLabel?: string; // shown when label === '' — the control's name, not a value
		ariaLabel: string;
		open: boolean;
		onToggle: (open: boolean) => void;
		children: Snippet;
		wide?: boolean;
	}

	const { glyph, label, restLabel, ariaLabel, open, onToggle, children, wide = false }: Props =
		$props();

	let root: HTMLDivElement | undefined = $state();

	// Close on outside click / Escape. Only bound while open, so a closed panel costs
	// no listeners — there are four of these on the page.
	$effect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) onToggle(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onToggle(false);
		};
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="facet" bind:this={root}>
	<button
		class="trigger"
		class:set={label !== ''}
		aria-label={ariaLabel}
		aria-expanded={open}
		aria-haspopup="menu"
		title={label || restLabel || ariaLabel}
		onclick={() => onToggle(!open)}
	>
		<span class="glyph">{glyph}</span>
		{#if label}<span class="label">{label}</span>{:else if restLabel}<span class="label">{restLabel}</span>{/if}
		<span class="chev" aria-hidden="true">⌄</span>
	</button>

	{#if open}
		<div class="panel" class:wide role="menu" tabindex="-1">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.facet { position: relative; flex-shrink: 0; }

	.trigger {
		display: flex; align-items: center; gap: 0.3rem;
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		height: var(--ctl-h, 1.75rem);
		padding: 0 0.5rem; /* horizontal only — vertical padding is what derived the height */
		cursor: pointer; transition: all 0.15s;
		white-space: nowrap; opacity: 0.72;
	}
	.trigger:hover { border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	.trigger:focus-visible { outline: none; border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	/* Set = the filter is doing work. Hierarchy via opacity, never a second colour. */
	.trigger.set { opacity: 1; border-color: rgba(var(--ui-rgb), 0.55); }
	.chev { opacity: 0.6; }

	/* A SET label is a value and can be long — the worst real one is
	   "Anarchist Library ▸ Anarcho-syndicalism". Four set controls otherwise
	   overflow 760px and .scope wraps, which puts the height variance back.
	   Full value stays in the trigger's title. */
	.label {
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.panel {
		position: absolute; top: calc(100% + 0.3rem); right: 0; z-index: 20;
		min-width: 11rem; max-height: 60vh; overflow-y: auto;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 0.4rem 0;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.05em;
	}
	.panel.wide { min-width: 17rem; }

	/* Narrow: the label drops, the glyph carries the control. A set filter keeps its
	   border so you can still tell something is filtered, just not what. */
	@media (max-width: 480px) {
		.label { display: none; }

		/* Narrow: the panel stays absolutely positioned so it scrolls with its trigger
		   (a fixed panel with top:auto resolves its top ONCE and then detaches on any
		   scroll). It is anchored right:0 to its own trigger, which is always on-screen,
		   so it extends leftward from a known-good point — but how much room it has
		   before the left edge varies with the trigger's position. width: max-content
		   lets a long row size the panel to its content, and the max-width caps that
		   growth so it cannot push past the viewport's left edge regardless of where
		   the trigger sits. */
		.panel,
		.panel.wide {
			min-width: 0;
			width: max-content;
			max-width: calc(100vw - 1.5rem);
			max-height: 50vh;
		}
	}
</style>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		glyph: string;
		label: string; // '' = unset → glyph only, no .set styling
		ariaLabel: string;
		open: boolean;
		onToggle: (open: boolean) => void;
		children: Snippet;
		wide?: boolean;
	}

	const { glyph, label, ariaLabel, open, onToggle, children, wide = false }: Props = $props();

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
		onclick={() => onToggle(!open)}
	>
		<span class="glyph">{glyph}</span>
		{#if label}<span class="label">{label}</span>{/if}
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
		padding: 0.3rem 0.5rem; cursor: pointer; transition: all 0.15s;
		white-space: nowrap; opacity: 0.72;
	}
	.trigger:hover { border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	.trigger:focus-visible { outline: none; border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	/* Set = the filter is doing work. Hierarchy via opacity, never a second colour. */
	.trigger.set { opacity: 1; border-color: rgba(var(--ui-rgb), 0.55); }
	.chev { opacity: 0.6; }

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

		.panel, .panel.wide {
			position: fixed;
			left: 0.75rem; right: 0.75rem;
			top: auto;
			min-width: 0; width: auto;
			max-height: 50vh;
		}
	}
</style>

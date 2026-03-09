<script lang="ts">
	import { themeState, PALETTES, type PaletteName } from '$lib/admin/theme.svelte';

	const ORDER: PaletteName[] = ['amber', 'sky', 'dusk', 'neutral'];
</script>

<div class="panel" role="dialog" aria-label="Theme palette picker">
	<p class="panel-label">palette</p>
	<div class="grid">
		{#each ORDER as name}
			{@const p = PALETTES[name]}
			<button
				class="palette-btn"
				class:active={themeState.active === name}
				onclick={() => themeState.applyPalette(name)}
				aria-pressed={themeState.active === name}
			>
				<span
					class="swatch"
					style="background:{p.swatchBg}; border-color:{p.swatchBorder}"
					aria-hidden="true"
				></span>
				<span class="palette-name">{p.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		left: 0;
		z-index: 100;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		padding: 0.7rem 0.75rem;
		width: 190px;
	}

	.panel-label {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--clr-dark-text);
		opacity: 0.5;
		margin: 0 0 0.55rem;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.3rem;
	}

	.palette-btn {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		background: none;
		border: 1px solid transparent;
		color: var(--clr-dark-text);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.35rem 0.5rem;
		min-height: 36px;
		cursor: pointer;
		transition: all 0.12s;
		opacity: 0.6;
		text-align: left;
		width: 100%;
	}
	.palette-btn:hover {
		opacity: 1;
		border-color: rgba(var(--dark-panel-rgb), 0.20);
	}
	.palette-btn.active {
		opacity: 1;
		border-color: rgba(var(--dark-panel-rgb), 0.35);
		background: rgba(var(--dark-panel-rgb), 0.10);
	}

	.swatch {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 1px solid;
		flex-shrink: 0;
	}
</style>

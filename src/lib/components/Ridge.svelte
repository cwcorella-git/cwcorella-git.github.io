<script lang="ts">
	// The western skyline as seen from downtown Reno, behind the glass panels.
	// Traced from SRTM elevations by scripts/trace-ridge.mjs; ridge.json records
	// the viewpoint and source. Heights are exaggerated (the real skyline rises
	// only a few degrees), but the shape is the real one.
	import { themeState } from '$lib/admin/theme.svelte';
	import ridge from '$lib/ridge.json';

	const VB_W = 1600, VB_H = 300;
	const BASE = 0.12, TOP = 0.92; // share of the box height the lowest and highest points reach

	const angles = ridge.skyline.map(([, a]) => a);
	const lo = Math.min(...angles), hi = Math.max(...angles);
	const last = ridge.skyline.length - 1;
	const path =
		`M0 ${VB_H} ` +
		ridge.skyline
			.map(([, a], i) => {
				const x = (i / last) * VB_W;
				const y = VB_H * (1 - (BASE + ((a - lo) / (hi - lo)) * (TOP - BASE)));
				return `L${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ') +
		` L${VB_W} ${VB_H} Z`;
</script>

<!-- ink is the VG-fidelity palette (rulings R8): nothing behind its panels. -->
{#if themeState.active !== 'ink'}
	<svg class="ridge" viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
		<path d={path} />
	</svg>
{/if}

<style>
	.ridge {
		position: fixed;
		left: 0;
		bottom: 0;
		width: 100vw;
		height: 30vh;
		z-index: 0;
		pointer-events: none;
	}
	/* Darker than the sky by day, lighter by night: the ground mixed toward the
	   text colour, which Sky.svelte already flips with the sun. */
	path {
		fill: color-mix(in srgb, var(--body-bg) 72%, var(--clr-text));
	}
</style>

<script lang="ts">
	import type { RailAnchor } from '$lib/library/railLogic';
	import { fractionToIndex } from '$lib/library/railLogic';

	interface Props {
		anchors: RailAnchor[];
		onSeek: (seek: string | null) => void;
		total: number | null;
		activeLabel: string | null;
		onScrubTo: (index: number) => void;
	}

	const { anchors, onSeek, total, activeLabel, onScrubTo }: Props = $props();

	const DRAG_THRESHOLD = 6; // px of travel before a press becomes a scrub

	let railEl: HTMLElement | undefined = $state();
	let dragging = $state(false);
	let bubbleY = $state(0);
	let justDragged = false;
	let startY = 0;
	let activePointer: number | null = null;

	function scrubToClientY(clientY: number) {
		if (!railEl || !total) return;
		const rect = railEl.getBoundingClientRect();
		const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
		bubbleY = y;
		onScrubTo(fractionToIndex(y / rect.height, total));
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 && e.button !== -1) return; // primary/pen only
		if (!railEl) return;
		const rect = railEl.getBoundingClientRect();
		if (rect.height < rect.width) return; // horizontal (mobile strip) → tap only
		startY = e.clientY;
		activePointer = e.pointerId;
		// no capture yet — a tap must still fire the button's click
	}

	function onPointerMove(e: PointerEvent) {
		if (activePointer === null || e.pointerId !== activePointer) return;
		if (!dragging) {
			if (Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
			dragging = true;
			railEl?.setPointerCapture(activePointer);
		}
		scrubToClientY(e.clientY);
	}

	function endPointer(e: PointerEvent) {
		if (activePointer === null || e.pointerId !== activePointer) return;
		if (dragging) {
			justDragged = true; // suppress the trailing synthetic click on a button
			setTimeout(() => {
				justDragged = false;
			}, 0);
			try {
				railEl?.releasePointerCapture(activePointer);
			} catch {
				/* pointer already released */
			}
		}
		dragging = false;
		activePointer = null;
	}

	function onButtonClick(seek: string | null) {
		if (justDragged) {
			justDragged = false;
			return;
		}
		onSeek(seek);
	}
</script>

{#if anchors.length > 0}
	<nav
		class="rail"
		class:dragging
		aria-label="jump to"
		bind:this={railEl}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={endPointer}
		onpointercancel={endPointer}
	>
		{#each anchors as a (a.label)}
			<button
				class="rail-btn"
				class:active={a.label === activeLabel}
				aria-current={a.label === activeLabel ? 'true' : undefined}
				onclick={() => onButtonClick(a.seek)}
				title={'jump to ' + a.label}
			>
				{a.label}
			</button>
		{/each}
		{#if dragging && activeLabel}
			<span class="scrub-bubble" style="top: {bubbleY}px" aria-hidden="true">{activeLabel}</span>
		{/if}
	</nav>
{/if}

<style>
	.rail {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 70vh;
		flex-shrink: 0;
		padding-left: 0.4rem;
		touch-action: none; /* dragging the rail must not scroll the page */
		user-select: none;
	}
	.rail-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		line-height: 1.35;
		padding: 0 0.25rem;
		cursor: pointer;
		opacity: 0.4;
		transition: opacity 0.1s;
		text-align: center;
	}
	.rail-btn:hover {
		opacity: 1;
	}
	.rail-btn.active {
		opacity: 1;
		font-weight: 700;
	}
	.rail-btn.active::before {
		content: '▸';
		position: absolute;
		margin-left: -0.7rem;
	}
	.scrub-bubble {
		position: absolute;
		right: 100%;
		margin-right: 0.4rem;
		transform: translateY(-50%);
		padding: 0.15rem 0.4rem;
		background: var(--clr-text);
		color: var(--clr-bg, #000);
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		white-space: nowrap;
		pointer-events: none;
	}

	/* Below the mobile breakpoint the rail is a horizontal scroll strip: no scrub
	   (pointerdown bails on a wider-than-tall rect), taps + highlight still work. */
	@media (max-width: 480px) {
		.rail {
			flex-direction: row;
			justify-content: flex-start;
			height: auto;
			gap: 0.05rem;
			overflow-x: auto;
			padding-left: 0;
			margin-bottom: 0.5rem;
			touch-action: pan-x;
		}
	}
</style>

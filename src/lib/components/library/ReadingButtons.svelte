<script lang="ts">
	import { readingButtons } from '$lib/library/readingLogic';
	import type { ReadingAction } from '$lib/library/readingLogic';
	import type { ReadingState } from '$lib/library/types';

	interface Props {
		state: ReadingState | undefined;
		canAdd?: boolean;
		onAct: (a: ReadingAction) => void;
	}
	const { state, canAdd = false, onAct }: Props = $props();
	const buttons = $derived(readingButtons(state, canAdd));

	// These sit beside the card's <a>, not inside it, so a click can never also
	// open the reader; stopPropagation keeps a parent handler from seeing it too.
	function click(e: MouseEvent, a: ReadingAction) {
		e.preventDefault();
		e.stopPropagation();
		onAct(a);
	}
</script>

{#if buttons.length > 0}
	<span class="rb" role="group" aria-label="Reading list">
		{#each buttons as b (b.action)}
			<button type="button" class="b" class:x={b.action === 'remove'} class:add={b.action === 'add'}
				aria-label={b.action === 'remove' ? 'remove from reading list' : b.label}
				onclick={(e) => click(e, b.action)}>{b.label}</button>
		{/each}
	</span>
{/if}

<style>
	.rb { display: inline-flex; gap: 0.25rem; }
	.b {
		background: rgba(var(--ui-rgb), 0.08); border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text); cursor: pointer; font-family: var(--font-ui);
		font-size: 0.5rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.1rem 0.4rem;
	}
	.b:hover { background: rgba(var(--ui-rgb), 0.2); }
	.b.add { background: none; border-style: dashed; opacity: 0.7; }
	.b.add:hover { opacity: 1; }
</style>

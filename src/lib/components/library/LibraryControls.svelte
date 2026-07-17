<script lang="ts">
	import type { LibraryControls } from '$lib/library/libraryLogic';
	import type { Facets } from '$lib/library/types';
	import TagChipInput from './TagChipInput.svelte';
	import { libraryState } from '$lib/library/libraryState.svelte';

	interface Props {
		controls: LibraryControls;
		facets: Facets | null;
		onChange: (patch: Partial<LibraryControls>) => void;
	}

	const { controls, facets, onChange }: Props = $props();

	const SORT_OPTIONS: { value: string; label: string }[] = [
		{ value: 'title', label: 'Title' },
		{ value: 'author', label: 'Author' },
		{ value: 'publication_date', label: 'Date published' },
		{ value: 'word_count', label: 'Word count' }
	];

	// ── sort / direction ─────────────────────────────────────────────────
	function onSortChange(e: Event) {
		onChange({ sort: (e.target as HTMLSelectElement).value });
	}

	function toggleDir() {
		onChange({ dir: controls.dir === 'asc' ? 'desc' : 'asc' });
	}
</script>

<div class="controls">
	<div class="controls-row">
		<TagChipInput
			{facets}
			tags={controls.filters.tags ?? []}
			q={controls.q}
			onTagsChange={(tags, opts) =>
				onChange({
					filters: { ...controls.filters, tags },
					...(opts?.clearQ ? { q: '' } : {})
				})}
			onQChange={(q) => onChange({ q })}
			searchTags={(q) => libraryState.searchTags(q)}
		/>

		<div class="capsule">
			<select class="cap-sel" value={controls.sort} onchange={onSortChange} aria-label="Sort by">
				{#each SORT_OPTIONS as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<button
				class="cap-btn"
				onclick={toggleDir}
				aria-label={controls.dir === 'asc' ? 'ascending' : 'descending'}
			>{controls.dir === 'asc' ? '↑' : '↓'}</button>
		</div>

		<div class="seg">
			<button
				class="seg-btn"
				class:on={controls.view === 'list'}
				aria-label="List view"
				aria-pressed={controls.view === 'list'}
				title="List view"
				onclick={() => onChange({ view: 'list' })}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<button
				class="seg-btn"
				class:on={controls.view === 'grid'}
				aria-label="Grid view"
				aria-pressed={controls.view === 'grid'}
				title="Grid view"
				onclick={() => onChange({ view: 'grid' })}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
				</svg>
			</button>
		</div>
	</div>
</div>

<style>
	.controls {
		display: flex; flex-direction: column; gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.controls-row {
		display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
	}

	.capsule {
		display: inline-flex; align-items: center;
		height: var(--ctl-h, 1.75rem);
		border: 1px solid rgba(var(--ui-rgb), 0.28); flex-shrink: 0;
	}
	.cap-sel, .cap-btn {
		height: 100%;
		background: none; border: none; color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0 0.5rem; cursor: pointer;
	}
	.cap-btn { border-left: 1px solid rgba(var(--ui-rgb), 0.28); padding: 0 0.4rem; }
	.capsule:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	.seg {
		display: inline-flex; align-items: center;
		height: var(--ctl-h, 1.75rem);
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		overflow: hidden; flex-shrink: 0;
	}
	.seg:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.seg-btn {
		display: inline-flex; align-items: center; justify-content: center;
		height: 100%; padding: 0 0.45rem;
		background: none; border: none; color: var(--clr-text);
		opacity: 0.5; cursor: pointer; transition: opacity 0.15s, background 0.15s;
	}
	.seg-btn:hover { opacity: 1; }
	/* Active = lit, via opacity + a wash of the SAME colour. Not a second hue —
	   VG uses blue here; the one-colour rule forbids it. */
	.seg-btn.on { opacity: 1; background: rgba(var(--ui-rgb), 0.14); }
	.seg-btn svg { width: 12px; height: 12px; }

	@media (max-width: 480px) {
		.controls-row { gap: 0.5rem; }
	}
</style>

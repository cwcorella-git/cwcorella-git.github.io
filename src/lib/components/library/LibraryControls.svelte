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

	function toggleView() {
		onChange({ view: controls.view === 'list' ? 'grid' : 'list' });
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

		<button
			class="view-toggle"
			onclick={toggleView}
			aria-label={`switch to ${controls.view === 'list' ? 'grid' : 'list'} view`}
		>{controls.view === 'list' ? '▤' : '▦'}</button>
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
	.view-toggle {
		height: var(--ctl-h, 1.75rem);
		background: none; border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-size: 0.6rem; /* was 0.7rem — the sole reason this control rendered taller */
		padding: 0 0.5rem; cursor: pointer; flex-shrink: 0;
	}
	.capsule:hover, .view-toggle:hover { border-color: rgba(var(--ui-rgb), 0.45); }

	@media (max-width: 480px) {
		.controls-row { gap: 0.5rem; }
	}
</style>

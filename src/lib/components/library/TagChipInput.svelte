<script lang="ts">
	import { filterTagBuckets } from '$lib/library/tagPanelLogic';
	import type { Facets, FacetBucket } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		tags: string[];
		q: string;
		onTagsChange: (tags: string[]) => void;
		onQChange: (q: string) => void;
		searchTags: (q: string) => Promise<FacetBucket[]>;
	}

	const { facets, tags, q, onTagsChange, onQChange, searchTags }: Props = $props();

	let text = $state('');
	let open = $state(false);
	let remote = $state<FacetBucket[] | null>(null);
	let root: HTMLDivElement | undefined = $state();
	let debounce: ReturnType<typeof setTimeout> | undefined;

	// Local matches over the top-200 facet — no network for the common case.
	const local = $derived(filterTagBuckets(facets?.tags ?? [], text, tags));
	// Past the 200-cap the facet cannot answer, so fall back to the server. Prefer
	// local results when there are any; remote only fills the tail.
	const suggestions = $derived(local.length > 0 ? local : (remote ?? []));

	// Debounced remote lookup. Only fires when the local top-200 filter came up empty
	// and there is a non-empty query — the common case never hits the network. Clears
	// its pending timer on teardown/re-run so a stale timer can never resolve after
	// the query has already changed underneath it.
	$effect(() => {
		const needle = text.trim();
		if (needle === '' || local.length > 0) {
			remote = null;
			return;
		}
		const timer = setTimeout(async () => {
			try {
				remote = await searchTags(needle);
			} catch {
				remote = []; // an un-upgraded API has no /tags; degrade to local-only
			}
		}, 200);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	});

	function addTag(name: string) {
		if (!tags.includes(name)) onTagsChange([...tags, name]);
		text = '';
		remote = null;
	}

	function removeTag(name: string) {
		onTagsChange(tags.filter((t) => t !== name));
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		// Backspace on an empty input removes the last chip. Guarded on text === '' so
		// mid-word backspacing over typed text never eats a chip instead of a character.
		if (e.key === 'Backspace' && text === '' && tags.length > 0) {
			e.preventDefault();
			removeTag(tags[tags.length - 1]);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			// Enter commits the top suggestion if there is one; otherwise the typed
			// text becomes the search query. Off-facet tags are reachable by picking
			// them from the panel, which /tags?q= populates.
			if (suggestions.length > 0) addTag(suggestions[0].name);
			else onQChange(text.trim());
		}
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<div class="wrap" bind:this={root}>
	<div class="bar">
		{#each tags as tag (tag)}
			<span class="chip">
				{tag}
				<button class="x" aria-label={`remove tag ${tag}`} onclick={() => removeTag(tag)}>×</button>
			</span>
		{/each}
		<input
			class="input"
			placeholder={tags.length ? 'add tag…' : 'search library…'}
			bind:value={text}
			onfocus={() => (open = true)}
			onkeydown={onKeydown}
			aria-label="Search library or filter by tag"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if q}
			<button class="x clear" aria-label="clear search" onclick={() => onQChange('')}>×</button>
		{/if}
	</div>

	{#if open && suggestions.length > 0}
		<div class="panel" role="menu">
			{#each suggestions.slice(0, 12) as b (b.name)}
				<button class="row" role="menuitem" onclick={() => addTag(b.name)}>
					<span>{b.name}</span>
					<span class="c">{fmt(b.count)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap { position: relative; flex: 1; min-width: 10rem; }
	.bar {
		display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
	}
	.input {
		background: none; border: none; outline: none; flex: 1; min-width: 6rem;
		font-family: var(--font-ui); font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0; caret-color: currentColor;
	}
	.input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.chip {
		display: inline-flex; align-items: center; gap: 0.3rem;
		border: 1px solid rgba(var(--ui-rgb), 0.4);
		background: rgba(var(--ui-rgb), 0.09);
		padding: 0.1rem 0.38rem;
		font-family: var(--font-ui); font-size: 0.55rem; letter-spacing: 0.05em;
		color: var(--clr-text);
	}
	.x {
		background: none; border: none; cursor: pointer; padding: 0; line-height: 1;
		color: var(--clr-text); opacity: 0.55; font-size: 0.75rem;
	}
	.x:hover { opacity: 1; }
	.panel {
		position: absolute; top: calc(100% + 0.3rem); left: 0; z-index: 20;
		min-width: 15rem; max-height: 50vh; overflow-y: auto;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 0.4rem 0;
	}
	.row {
		display: flex; justify-content: space-between; gap: 1rem; width: 100%;
		background: none; border: none; cursor: pointer; text-align: left;
		color: var(--clr-text); opacity: 0.7;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.04em;
		padding: 0.25rem 0.7rem; transition: opacity 0.12s;
	}
	.row:hover { opacity: 1; background: rgba(var(--ui-rgb), 0.12); }
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
</style>

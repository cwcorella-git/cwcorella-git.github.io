<script lang="ts">
	import { untrack } from 'svelte';
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

	let text = $state(untrack(() => q));
	let open = $state(false);
	let remote = $state<FacetBucket[] | null>(null);
	let root: HTMLDivElement | undefined = $state();
	let debounce: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	// Live search: typing fires onQChange 260ms after the user stops, so results
	// update as-you-type without a network call per keystroke. Separate from the
	// remote tag-lookup debounce below (200ms, its own `generation` token) — the two
	// debounce independent things and must not share a timer.
	const SEARCH_DEBOUNCE_MS = 260;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const value = text.trim();
			// Set lastSyncedQ before calling onQChange, same as the prop-sync effect
			// below expects: when the parent's q prop comes back around as this same
			// value, the effect sees q === lastSyncedQ and leaves `text` alone instead
			// of clobbering whatever the user has typed since.
			lastSyncedQ = value;
			onQChange(value);
		}, SEARCH_DEBOUNCE_MS);
	}

	$effect(() => {
		return () => clearTimeout(searchTimer);
	});

	// Local matches over the top-200 facet — no network for the common case.
	const local = $derived(filterTagBuckets(facets?.tags ?? [], text, tags));
	// Past the 200-cap the facet cannot answer, so fall back to the server. Prefer
	// local results when there are any; remote only fills the tail.
	const suggestions = $derived(local.length > 0 ? local : (remote ?? []));

	// Keep the local input in sync if q changes from outside (e.g. a future
	// "clear all" action) without fighting the user's typing.
	let lastSyncedQ = untrack(() => q);
	$effect(() => {
		if (q !== lastSyncedQ) {
			lastSyncedQ = q;
			text = q;
		}
	});

	// Debounced remote lookup. Only fires when the local top-200 filter came up empty
	// and there is a non-empty query — the common case never hits the network. Clears
	// its pending timer on teardown/re-run, but a timer that already fired cannot be
	// recalled — so every scheduled lookup is tagged with a generation token and a
	// response only lands if it is still the newest, otherwise a slow earlier query
	// could resolve after a newer one and overwrite the panel with stale results. The
	// token is bumped unconditionally at the top of the effect, before the early-return
	// guard, so every effect re-run invalidates any in-flight lookup — including re-runs
	// that schedule nothing (e.g. the input was cleared out from under a pending request).
	$effect(() => {
		const mine = ++generation;
		const needle = text.trim();
		if (needle === '' || local.length > 0) {
			remote = null;
			return;
		}
		const timer = setTimeout(async () => {
			try {
				const res = await searchTags(needle);
				if (mine === generation) remote = res;
			} catch {
				if (mine === generation) remote = []; // un-upgraded API has no /tags; degrade to local-only
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
		// Committing a chip retires whatever the user was typing — cancel the pending
		// live-search timer so it cannot fire afterward with the now-stale text.
		clearTimeout(searchTimer);
		if (!tags.includes(name)) onTagsChange([...tags, name]);
		text = '';
		remote = null;
	}

	function removeTag(name: string) {
		onTagsChange(tags.filter((t) => t !== name));
	}

	function clearSearch() {
		// A stale debounce firing after this would resurrect the just-cleared query.
		clearTimeout(searchTimer);
		text = '';
		lastSyncedQ = '';
		onQChange('');
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
			// Enter commits a chip only when the typed text is an exact (case-insensitive)
			// match for a suggestion's name — otherwise it's ambiguous whether the user
			// meant a tag or a full-text search, so we run the search instead. Non-exact
			// tags are still reachable by clicking them in the panel. Either branch
			// supersedes the debounced live search, so cancel any pending timer —
			// otherwise it could fire later with the pre-Enter text.
			clearTimeout(searchTimer);
			const needle = text.trim().toLowerCase();
			const exact = suggestions.find((s) => s.name.toLowerCase() === needle);
			if (exact) {
				addTag(exact.name);
			} else {
				const value = text.trim();
				lastSyncedQ = value;
				onQChange(value);
			}
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
			oninput={scheduleSearch}
			onfocus={() => (open = true)}
			onkeydown={onKeydown}
			aria-label="Search library or filter by tag"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if q}
			<button class="x clear" aria-label="clear search" onclick={clearSearch}>×</button>
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

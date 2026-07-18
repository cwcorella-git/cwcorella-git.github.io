<script lang="ts">
	import { libraryClient } from '$lib/library/libraryState.svelte';
	let { tags, onChange }: { tags: string[]; onChange: (t: string[]) => void } = $props();
	let q = $state('');
	let suggestions = $state<string[]>([]);
	let generation = 0;

	async function search(term: string) {
		const gen = ++generation;
		if (!term.trim()) { suggestions = []; return; }
		try {
			const res = await libraryClient.searchTags(term, 8);
			if (gen !== generation) return;
			suggestions = res.map((b) => b.name).filter((n) => !tags.includes(n));
		} catch { if (gen === generation) suggestions = []; }
	}
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => { const t = q; clearTimeout(timer); timer = setTimeout(() => search(t), 200); });

	function add(name: string) {
		const n = name.trim();
		if (n && !tags.includes(n)) onChange([...tags, n]);
		q = ''; suggestions = [];
	}
	function remove(t: string) { onChange(tags.filter((x) => x !== t)); }
	function onKey(e: KeyboardEvent) { if (e.key === 'Enter') { e.preventDefault(); add(q); } }
</script>

<div class="tag-editor">
	<div class="chips">
		{#each tags as t (t)}
			<span class="chip">{t}<button class="x" onclick={() => remove(t)} aria-label={`remove ${t}`}>×</button></span>
		{/each}
	</div>
	<input class="tag-input" bind:value={q} onkeydown={onKey} placeholder="add tag…" />
	{#if suggestions.length}
		<ul class="suggest">
			{#each suggestions as s (s)}<li><button onclick={() => add(s)}>{s}</button></li>{/each}
		</ul>
	{/if}
</div>

<style>
	.tag-editor { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(var(--ui-rgb), 0.15); }
	.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
	.chip { display: inline-flex; align-items: center; gap: 0.25rem; border: 1px solid rgba(var(--ui-rgb), 0.28);
		border-radius: 10px; padding: 0.05rem 0.5rem; font-family: var(--font-ui); font-size: 0.7rem; color: var(--clr-text); }
	.chip .x { background: none; border: none; color: var(--clr-text); cursor: pointer; font-size: 0.9rem; line-height: 1; opacity: 0.6; }
	.tag-input { background: rgba(var(--ui-rgb), 0.06); border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text); font-family: var(--font-ui); font-size: 0.72rem; padding: 0.3rem 0.5rem; width: 100%; }
	.suggest { list-style: none; margin: 0.25rem 0 0; padding: 0; border: 1px solid rgba(var(--ui-rgb), 0.22); }
	.suggest button { display: block; width: 100%; text-align: left; background: none; border: none;
		color: var(--clr-text); font-family: var(--font-ui); font-size: 0.72rem; padding: 0.3rem 0.5rem; cursor: pointer; }
	.suggest button:hover { background: rgba(var(--ui-rgb), 0.1); }
</style>

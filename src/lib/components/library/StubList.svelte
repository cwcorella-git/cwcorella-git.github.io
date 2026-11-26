<script lang="ts">
	import ReadingButtons from './ReadingButtons.svelte';
	import type { ReadingItem, ReadingPatch } from '$lib/library/types';
	import { stubDraft, stubPatch, type ReadingAction, type StubDraft } from '$lib/library/readingLogic';
	import { toast } from '$lib/admin/toast.svelte';

	interface Props {
		items: ReadingItem[];
		onAct: (itemId: number, a: ReadingAction) => void;
		onSave: (itemId: number, patch: ReadingPatch) => Promise<boolean>;
	}
	const { items, onAct, onSave }: Props = $props();

	// One entry is edited at a time; the draft lives here, so a failed save keeps it.
	let editing = $state<number | null>(null);
	let draft = $state<StubDraft | null>(null);
	let saving = $state(false);

	function act(it: ReadingItem, a: ReadingAction) {
		if (a !== 'edit') return onAct(it.item_id, a);
		if (editing === it.item_id) { editing = null; draft = null; return; }
		editing = it.item_id;
		draft = stubDraft(it);
	}

	async function save(it: ReadingItem) {
		if (!draft) return;
		const { patch, problems } = stubPatch(it, draft);
		if (problems.length > 0) { toast.error(problems[0]); return; }
		if (Object.keys(patch).length === 0) { editing = null; draft = null; return; }
		saving = true;
		const ok = await onSave(it.item_id, patch);
		saving = false;
		if (ok) { editing = null; draft = null; toast.success('saved'); }
	}

	// A stub is a book we hold links for but no text. Its links are the point:
	// they are shown in stored order, and only http(s) is ever linked (the API
	// refuses anything else, and this checks again before rendering an href).
	const safe = (u: string) => /^https?:\/\//i.test(u);
</script>

{#if items.length > 0}
	<section class="stubs" aria-label="Reading list entries without text">
		<h3>no text in the library <span class="n">{items.length.toLocaleString()}</span></h3>
		<ul>
			{#each items as it (it.item_id)}
				<li class="stub">
					<span class="t">
						<span class="title">{it.title ?? '(untitled)'}</span>
						<span class="meta">{[it.author, it.year_hint, it.category].filter(Boolean).join(' · ')}</span>
					</span>
					<span class="links">
						{#each it.links as l (l.url)}
							{#if safe(l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.name}</a>{/if}
						{/each}
					</span>
					<ReadingButtons
						state={{ item_id: it.item_id, to_read: Boolean(it.to_read), read: it.read, links: it.links }}
						onAct={(a) => act(it, a)}
					/>
					{#if editing === it.item_id && draft}
						<form class="ed" onsubmit={(e) => { e.preventDefault(); void save(it); }}>
							<input aria-label="title" placeholder="title" bind:value={draft.title} />
							<input aria-label="author" placeholder="author" bind:value={draft.author} />
							<input aria-label="year" placeholder="year" inputmode="numeric" bind:value={draft.year} />
							<input aria-label="category" placeholder="category" bind:value={draft.category} />
							{#each draft.links as l, i (i)}
								<span class="lk">
									<input aria-label="link name" placeholder="name" bind:value={l.name} />
									<input aria-label="link url" placeholder="https://" bind:value={l.url} />
									<button type="button" class="mini" aria-label="remove link"
										onclick={() => draft && (draft.links = draft.links.filter((_, k) => k !== i))}>x</button>
								</span>
							{/each}
							<span class="acts">
								<button type="button" class="mini" onclick={() => draft && (draft.links = [...draft.links, { name: '', url: '' }])}>add link</button>
								<button type="submit" class="mini" disabled={saving}>save</button>
								<button type="button" class="mini" onclick={() => { editing = null; draft = null; }}>cancel</button>
							</span>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.stubs { margin: 0 0 0.8rem; border: 1px solid rgba(var(--ui-rgb), 0.16); }
	h3 {
		margin: 0; padding: 0.4rem 0.7rem; font-family: var(--font-ui); font-size: 0.55rem;
		letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-text); opacity: 0.7;
	}
	.n { font-variant-numeric: tabular-nums; }
	ul { list-style: none; margin: 0; padding: 0; max-height: 38vh; overflow-y: auto; }
	.stub {
		display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0.3rem 0.8rem;
		padding: 0.4rem 0.7rem; border-top: 1px solid rgba(var(--ui-rgb), 0.12);
		box-shadow: inset 3px 0 0 var(--clr-text);
	}
	.t { display: flex; flex-direction: column; min-width: 0; flex: 1 1 14rem; }
	.title { font-family: var(--font-prose); font-size: 0.78rem; color: var(--clr-text); }
	.meta { font-family: var(--font-ui); font-size: 0.55rem; color: var(--clr-text); opacity: 0.6; }
	.links { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; font-family: var(--font-ui); font-size: 0.55rem; }
	.links a { color: var(--clr-text); opacity: 0.75; }
	.ed { flex: 1 1 100%; display: flex; flex-direction: column; gap: 0.25rem; padding: 0.3rem 0 0.2rem; }
	.ed input {
		font-family: var(--font-ui); font-size: 0.65rem; color: var(--clr-text);
		background: rgba(var(--ui-rgb), 0.06); border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.2rem 0.4rem; min-width: 0;
	}
	.lk { display: flex; gap: 0.25rem; }
	.lk input:last-of-type { flex: 1; }
	.acts { display: flex; gap: 0.3rem; }
	.mini {
		background: rgba(var(--ui-rgb), 0.08); border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text); cursor: pointer; font-family: var(--font-ui);
		font-size: 0.5rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.1rem 0.4rem;
	}
</style>

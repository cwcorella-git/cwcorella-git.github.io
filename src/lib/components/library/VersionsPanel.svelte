<script lang="ts">
	import type { DocVersion } from '$lib/library/types';
	let { versions, onRestore, onRestoreOriginal, edited }: {
		versions: DocVersion[]; onRestore: (id: number) => void;
		onRestoreOriginal: () => void; edited: boolean;
	} = $props();
</script>

<div class="versions">
	{#if edited}
		<button class="restore-original" onclick={onRestoreOriginal}>restore original</button>
	{/if}
	{#if versions.length === 0}
		<p class="empty">no saved versions</p>
	{:else}
		<ul>
			{#each versions as v (v.version_id)}
				<li>
					<span class="when">{v.created_at}</span>
					<span class="vtitle">{v.title ?? '—'}</span>
					<button onclick={() => onRestore(v.version_id)}>restore</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.versions { font-family: var(--font-ui); font-size: 0.72rem; color: var(--clr-text); }
	.restore-original { background: none; border: 1px solid rgba(var(--ui-rgb), 0.3); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.68rem; padding: 0.25rem 0.6rem; cursor: pointer; margin-bottom: 0.75rem; }
	.versions ul { list-style: none; margin: 0; padding: 0; }
	.versions li { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid rgba(var(--ui-rgb), 0.12); }
	.versions .when { opacity: 0.6; white-space: nowrap; }
	.versions .vtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.versions button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.25); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.66rem; padding: 0.1rem 0.4rem; cursor: pointer; }
	.empty { opacity: 0.5; }
</style>

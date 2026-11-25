// Pure filtering/grouping for the public /resources page.
export interface Resource {
	id: string; name: string; url: string; cluster: string; kind: string;
	oneLiner: string; license: string | null; cost: string | null;
	selfHostable: string | null; decentralized: string | null; tags: string[]; verified: boolean;
}
export interface Cluster { id: string; name: string; description: string }

export interface Filter { query: string; cluster: string; selfHostableOnly: boolean }

export function matches(r: Resource, f: Filter): boolean {
	if (f.cluster && r.cluster !== f.cluster) return false;
	if (f.selfHostableOnly && r.selfHostable !== 'yes') return false;
	const q = f.query.trim().toLowerCase();
	if (!q) return true;
	return [r.name, r.oneLiner, r.kind, ...r.tags].some((s) => s.toLowerCase().includes(q));
}

/** Filtered items grouped by cluster in the cluster list's order; empty groups dropped. */
export function groupByCluster(items: Resource[], clusters: Cluster[], f: Filter) {
	const kept = items.filter((r) => matches(r, f));
	return clusters
		.map((c) => ({ cluster: c, items: kept.filter((r) => r.cluster === c.id) }))
		.filter((g) => g.items.length > 0);
}

/** A hostname for display; falls back to the raw url. */
export function host(url: string): string {
	try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Short rail label for a topic: the rail is a narrow column, topic names are not. */
const SHORT: Record<string, string> = {
	'p2p-transport': 'P2P', 'dns-naming': 'DNS', 'edge-security': 'EDGE', 'supply-chain': 'SUPPLY',
	'selfhost-collab': 'SELF', 'governance-funding': 'GOV', 'privacy-opsec': 'PRIV', 'ai-tooling': 'AI',
	'3d-mocap': '3D', 'hardware-field': 'HW', 'dev-misc': 'DEV'
};
export function shortLabel(c: Cluster): string {
	return SHORT[c.id] ?? c.name.slice(0, 4).toUpperCase();
}

export const SELF_HOSTABLE_TAG = 'self-hostable';
export type Tag = { kind: 'cluster'; id: string; label: string } | { kind: 'self'; id: string; label: string };

/** Tags that match what is being typed, minus the ones already applied. Same idea as /reading's suggestions. */
export function suggestTags(q: string, clusters: Cluster[], f: Pick<Filter, 'cluster' | 'selfHostableOnly'>): Tag[] {
	const s = q.trim().toLowerCase();
	if (!s) return [];
	const all: Tag[] = [
		...(f.selfHostableOnly ? [] : [{ kind: 'self', id: SELF_HOSTABLE_TAG, label: SELF_HOSTABLE_TAG } as Tag]),
		...clusters.filter((c) => c.id !== f.cluster).map((c) => ({ kind: 'cluster', id: c.id, label: c.name }) as Tag)
	];
	return all.filter((t) => t.label.toLowerCase().includes(s));
}

/** One flat A–Z list (the guide-letter rail needs it flat). */
export function sortByName(items: Resource[]): Resource[] {
	const key = (n: string) => n.replace(/^[^\p{L}\p{N}]+/u, '').toLocaleLowerCase();
	return [...items].sort((a, b) => key(a.name).localeCompare(key(b.name)));
}

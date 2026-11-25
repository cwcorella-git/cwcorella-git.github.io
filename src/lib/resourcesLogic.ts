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

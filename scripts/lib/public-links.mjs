// Pure logic for the public resources export. No I/O, so it is testable.
// The catalogue lives in ~/Projects/apps/saved-links (workstation only);
// an entry reaches the public site ONLY if it has `public: true`.
// Everything else is withheld, and so is anything that trips a leak gate.

const SECRET_KEY = /(token|secret|session|passw|auth|credential|signature|^sig$|^key$|api[-_]?key|code)/i;

/** Why a public-flagged entry must NOT be exported, or null. */
export function leakReason(e) {
	if (e.private) return 'private';
	if (e.url_had_credentials) return 'url had credentials';
	if (e.cluster === 'personal') return 'personal cluster';
	if (e.duplicate_of) return 'duplicate';
	let u;
	try { u = new URL(e.url); } catch { return 'unparseable url'; }
	if (!/^https?:$/.test(u.protocol)) return 'non-http url';
	if (u.username || u.password) return 'userinfo in url';
	if (/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return 'local address';
	for (const k of u.searchParams.keys()) if (SECRET_KEY.test(k)) return `secret-shaped query key "${k}"`;
	return null;
}

/** The only fields that leave the workstation. No what_it_is, held, source_line. */
export function project(e) {
	return {
		id: e.id,
		name: e.name,
		url: e.url,
		cluster: e.cluster,
		kind: e.kind,
		oneLiner: e.one_liner,
		license: e.license?.category ?? null,
		cost: e.cost?.model ?? null,
		selfHostable: e.self_hostable ?? null,
		decentralized: e.decentralized ?? null,
		tags: Array.isArray(e.tags) ? e.tags : [],
		verified: e.confidence === 'verified'
	};
}

/** @returns {{ items: object[], refused: {id:string, why:string}[] }} */
export function selectPublic(entries) {
	const items = [];
	const refused = [];
	for (const e of entries) {
		if (e.public !== true) continue;
		const why = leakReason(e);
		if (why) refused.push({ id: e.id, why });
		else items.push(project(e));
	}
	items.sort((a, b) => a.cluster.localeCompare(b.cluster) || a.name.localeCompare(b.name));
	return { items, refused };
}

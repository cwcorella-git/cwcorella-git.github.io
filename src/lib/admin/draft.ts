// localStorage draft persistence for write queue payloads.
// Keyed by domain name. Guards against SSR (build runs server-side).

const PREFIX = 'cwc:draft:';

function canUse() {
	return typeof localStorage !== 'undefined';
}

export const draftStore = {
	save(domain: string, data: unknown): void {
		if (!canUse()) return;
		try { localStorage.setItem(PREFIX + domain, JSON.stringify(data)); } catch {}
	},

	load<T>(domain: string): T | null {
		if (!canUse()) return null;
		try {
			const raw = localStorage.getItem(PREFIX + domain);
			return raw ? (JSON.parse(raw) as T) : null;
		} catch { return null; }
	},

	clear(domain: string): void {
		if (!canUse()) return;
		try { localStorage.removeItem(PREFIX + domain); } catch {}
	}
};

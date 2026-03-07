import { decryptSealed, decryptContentKey, isUnlockDay } from './tlock';
import { decryptDoc } from './crypto';
import type { JournalMeta } from '$lib/types';

let _mode       = $state(false);
let _contentKey = $state('');
let _index      = $state<JournalMeta[]>([]);
let _checking   = $state(false);

export const archiveState = {
	get mode():       boolean       { return _mode; },
	get contentKey(): string        { return _contentKey; },
	get index():      JournalMeta[] { return _index; },
	get checking():   boolean       { return _checking; },

	async tryUnlock(): Promise<boolean> {
		if (!isUnlockDay()) return false;
		if (_mode) return true;
		_checking = true;
		try {
			// Decrypt content-key.tlock to recover the AES passphrase
			const ckRes = await fetch('/docs/private/content-key.tlock');
			if (!ckRes.ok) return false;
			const ckText = await ckRes.text();
			_contentKey = await decryptContentKey(ckText);

			// Load and decrypt journals index
			const idxRes = await fetch('/docs/private/journals-index.enc');
			if (!idxRes.ok) return false;
			const encIdx = await idxRes.json();
			const plain  = await decryptDoc(encIdx, _contentKey);
			_index = JSON.parse(plain);

			_mode = true;
			return true;
		} catch {
			return false;
		} finally {
			_checking = false;
		}
	},

	/** Decrypt a regular .enc entry using the unlocked AES key. */
	async decryptEntry(slug: string): Promise<string> {
		const res = await fetch(`/docs/private/journals/${slug}.enc`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const enc = await res.json();
		return decryptDoc(enc, _contentKey);
	},

	/** Decrypt a sealed .tlock entry using the drand beacon. */
	async decryptSealedEntry(slug: string): Promise<string> {
		const res = await fetch(`/docs/private/journals/${slug}.tlock`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const ct = await res.text();
		return decryptSealed(ct);
	},
};

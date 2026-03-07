import { timelockEncrypt, timelockDecrypt, mainnetClient, Buffer } from 'tlock-js';

// Quicknet genesis: 2023-08-23T12:09:27Z (unix 1692803367), period 3s
// round = floor((2095-02-13T00:00:00Z_ms - 1692803367000) / 3000) + 1
export const UNLOCK_DATE  = new Date('2095-02-13T00:00:00Z');
export const UNLOCK_ROUND = 751_863_412;
export const CHAIN_HASH   = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';

export function isUnlockDay(): boolean {
	return Date.now() >= UNLOCK_DATE.getTime();
}

/** Encrypt plaintext to the 2095 unlock round. Returns AGE-armored ciphertext. */
export async function sealContent(plaintext: string): Promise<string> {
	const client = mainnetClient();
	const payload = Buffer.from(plaintext, 'utf8');
	return timelockEncrypt(UNLOCK_ROUND, payload, client);
}

/**
 * Decrypt an AGE-armored tlock ciphertext.
 * Fetches the drand beacon internally — fails before 2095 (round not yet reached).
 */
export async function decryptSealed(ciphertext: string): Promise<string> {
	const client = mainnetClient();
	const buf = await timelockDecrypt(ciphertext, client);
	return buf.toString('utf8');
}

/** Tlock-encrypt the AES content key for content-key.tlock. */
export async function sealContentKey(contentKey: string): Promise<string> {
	return sealContent(contentKey);
}

/** Decrypt the content key from content-key.tlock. */
export async function decryptContentKey(ciphertext: string): Promise<string> {
	return decryptSealed(ciphertext);
}

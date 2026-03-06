import { describe, it, expect } from 'vitest';
import { encryptDoc, decryptDoc, type EncryptedDoc } from './crypto.js';

describe('encryptDoc / decryptDoc', () => {
	it('roundtrip: decrypting an encrypted document returns original text', async () => {
		const original = 'Hello, world! This is a test document.';
		const passphrase = 'correct-horse-battery-staple';
		const enc = await encryptDoc(original, passphrase);
		const result = await decryptDoc(enc, passphrase);
		expect(result).toBe(original);
	});

	it('roundtrip: works with multi-line markdown content', async () => {
		const original = '# Title\n\nSome **bold** text.\n\n- item 1\n- item 2\n';
		const passphrase = 'my-secret-pass';
		const enc = await encryptDoc(original, passphrase);
		const result = await decryptDoc(enc, passphrase);
		expect(result).toBe(original);
	});

	it('EncryptedDoc has iv, ct, and salt fields as strings', async () => {
		const enc = await encryptDoc('test', 'passphrase');
		expect(enc).toHaveProperty('iv');
		expect(enc).toHaveProperty('ct');
		expect(enc).toHaveProperty('salt');
		expect(typeof enc.iv).toBe('string');
		expect(typeof enc.ct).toBe('string');
		expect(typeof enc.salt).toBe('string');
	});

	it('iv and salt are non-empty base64 strings', async () => {
		const enc = await encryptDoc('test', 'passphrase');
		expect(enc.iv.length).toBeGreaterThan(0);
		expect(enc.salt.length).toBeGreaterThan(0);
		expect(enc.ct.length).toBeGreaterThan(0);
	});

	it('different encryptions of same plaintext produce different ciphertexts (random IV/salt)', async () => {
		const original = 'same text';
		const passphrase = 'same-pass';
		const enc1 = await encryptDoc(original, passphrase);
		const enc2 = await encryptDoc(original, passphrase);
		// Due to random IV and salt, ct should differ
		expect(enc1.ct).not.toBe(enc2.ct);
	});

	it('wrong passphrase throws on decryption', async () => {
		const original = 'secret content';
		const enc = await encryptDoc(original, 'correct-pass');
		await expect(decryptDoc(enc, 'wrong-pass')).rejects.toThrow();
	});

	it('tampered ciphertext throws on decryption', async () => {
		const enc = await encryptDoc('content', 'passphrase');
		// Corrupt the ciphertext by replacing it with a different base64 string
		const tampered: EncryptedDoc = { ...enc, ct: btoa('garbage data that is not valid') };
		await expect(decryptDoc(tampered, 'passphrase')).rejects.toThrow();
	});
});

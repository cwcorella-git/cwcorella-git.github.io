export interface EncryptedDoc {
	iv: string;
	ct: string;
	salt: string;
}

function bufToBase64(buf: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): ArrayBuffer {
	const binary = atob(b64);
	const buf = new ArrayBuffer(binary.length);
	const view = new Uint8Array(buf);
	for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
	return buf;
}

async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		enc.encode(passphrase),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptDoc(markdown: string, passphrase: string): Promise<EncryptedDoc> {
	const enc = new TextEncoder();
	const saltBuf = crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer;
	const ivBuf = crypto.getRandomValues(new Uint8Array(12)).buffer as ArrayBuffer;
	const key = await deriveKey(passphrase, saltBuf);
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, enc.encode(markdown));
	return {
		iv: bufToBase64(ivBuf),
		ct: bufToBase64(ct),
		salt: bufToBase64(saltBuf)
	};
}

export async function decryptDoc(enc: EncryptedDoc, passphrase: string): Promise<string> {
	const salt = base64ToBuf(enc.salt);
	const iv = base64ToBuf(enc.iv);
	const ct = base64ToBuf(enc.ct);
	const key = await deriveKey(passphrase, salt);
	const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
	return new TextDecoder().decode(plain);
}

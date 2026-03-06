import type { Book } from '$lib/types';

const REPO = 'cwcorella-git/cwcorella-git.github.io';
const API = 'https://api.github.com';

function toBase64(str: string): string {
	return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(b64: string): string {
	return decodeURIComponent(escape(atob(b64)));
}

export async function validatePAT(pat: string): Promise<boolean> {
	const res = await fetch(`${API}/user`, {
		headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' }
	});
	return res.ok;
}

export async function getFile(pat: string, path: string): Promise<{ content: string; sha: string }> {
	const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
		headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' }
	});
	if (!res.ok) {
		if (res.status === 404) throw new Error('FILE_NOT_FOUND');
		throw new Error(`GitHub API error: ${res.status}`);
	}
	const data = await res.json();
	// data.content is base64, may have newlines
	const content = fromBase64(data.content.replace(/\n/g, ''));
	return { content, sha: data.sha };
}

export async function putFile(
	pat: string,
	path: string,
	content: string,
	sha: string | null,
	message: string
): Promise<void> {
	const body: Record<string, unknown> = {
		message,
		content: toBase64(content)
	};
	if (sha) body.sha = sha;

	const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${pat}`,
			Accept: 'application/vnd.github+json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.message || `GitHub API error: ${res.status}`, { cause: res.status });
	}
}

export async function putFileWithFreshSha(
	pat: string,
	path: string,
	content: string,
	message: string
): Promise<void> {
	let sha: string | null = null;
	try {
		const existing = await getFile(pat, path);
		sha = existing.sha;
	} catch (e: unknown) {
		if (e instanceof Error && e.message !== 'FILE_NOT_FOUND') throw e;
	}
	try {
		await putFile(pat, path, content, sha, message);
	} catch (e: unknown) {
		// 409 = SHA conflict (concurrent write). Retry once with a fresh SHA.
		if (e instanceof Error && (e as Error & { cause?: unknown }).cause === 409) {
			let retrySha: string | null = null;
			try {
				const fresh = await getFile(pat, path);
				retrySha = fresh.sha;
			} catch { /* file may not exist */ }
			await putFile(pat, path, content, retrySha, message);
		} else {
			throw e;
		}
	}
}

export async function updateBooksJson(pat: string, books: Book[]): Promise<void> {
	const content = JSON.stringify(books);
	await putFileWithFreshSha(pat, 'src/lib/books.json', content, 'update books.json');
}

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
		throw new Error(err.message || `GitHub API error: ${res.status}`);
	}
}

export async function updateBooksJson(pat: string, books: Book[]): Promise<void> {
	let sha: string | null = null;
	try {
		const existing = await getFile(pat, 'src/lib/books.json');
		sha = existing.sha;
	} catch (e: unknown) {
		if (e instanceof Error && e.message !== 'FILE_NOT_FOUND') throw e;
	}
	const content = JSON.stringify(books);
	await putFile(pat, 'src/lib/books.json', content, sha, 'update books.json');
}

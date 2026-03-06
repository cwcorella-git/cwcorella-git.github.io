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
	const b64 = toBase64(content);

	const headers = {
		Authorization: `Bearer ${pat}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json'
	};

	// Use low-level Git Data API — no blob SHA conflict, no 1MB content limit.
	// 1. Current HEAD commit SHA
	const refRes = await fetch(`${API}/repos/${REPO}/git/ref/heads/main`, { headers });
	if (!refRes.ok) throw new Error(`Failed to get ref: ${refRes.status}`);
	const headSha: string = (await refRes.json()).object.sha;

	// 2. Current tree SHA
	const commitRes = await fetch(`${API}/repos/${REPO}/git/commits/${headSha}`, { headers });
	if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
	const treeSha: string = (await commitRes.json()).tree.sha;

	// 3. Create blob
	const blobRes = await fetch(`${API}/repos/${REPO}/git/blobs`, {
		method: 'POST', headers,
		body: JSON.stringify({ content: b64, encoding: 'base64' })
	});
	if (!blobRes.ok) throw new Error(`Failed to create blob: ${blobRes.status}`);
	const blobSha: string = (await blobRes.json()).sha;

	// 4. Create tree
	const treeRes = await fetch(`${API}/repos/${REPO}/git/trees`, {
		method: 'POST', headers,
		body: JSON.stringify({
			base_tree: treeSha,
			tree: [{ path: 'src/lib/books.json', mode: '100644', type: 'blob', sha: blobSha }]
		})
	});
	if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
	const newTreeSha: string = (await treeRes.json()).sha;

	// 5 + 6. Create commit and advance ref, retrying if another commit lands between our
	//        GET and PATCH (GitHub Actions race → 422 "not a fast forward").
	async function createCommitAndAdvanceRef(parentSha: string): Promise<void> {
		const commitRes2 = await fetch(`${API}/repos/${REPO}/git/commits`, {
			method: 'POST', headers,
			body: JSON.stringify({ message: 'update books.json', tree: newTreeSha, parents: [parentSha] })
		});
		if (!commitRes2.ok) throw new Error(`Failed to create commit: ${commitRes2.status}`);
		const commitSha: string = (await commitRes2.json()).sha;

		const patchRes = await fetch(`${API}/repos/${REPO}/git/refs/heads/main`, {
			method: 'PATCH', headers,
			body: JSON.stringify({ sha: commitSha })
		});
		if (patchRes.ok) return;

		const patchErr = await patchRes.json().catch(() => ({}));
		if (patchRes.status === 422 && patchErr.message?.includes('not a fast forward')) {
			// Another commit landed — re-fetch HEAD and retry once
			const retryRef = await fetch(`${API}/repos/${REPO}/git/ref/heads/main`, { headers });
			if (!retryRef.ok) throw new Error(`Failed to re-fetch ref: ${retryRef.status}`);
			const newHead: string = (await retryRef.json()).object.sha;
			await createCommitAndAdvanceRef(newHead);
		} else {
			throw new Error(patchErr.message || `Failed to update ref: ${patchRes.status}`);
		}
	}

	await createCommitAndAdvanceRef(headSha);
}

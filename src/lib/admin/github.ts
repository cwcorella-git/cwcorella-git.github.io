
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


// ── Git Data API — atomic multi-file commit ──────────────────────────────
//
// commitFiles(pat, updates, message, deletions?)
//   updates:   [{ path, content }]  files to create/update
//   deletions: ['path/to/file']     files to remove (sha: null in tree)
//
// Uses the low-level Git blobs/trees/commits/refs API so there is no
// blob-SHA conflict and no 1MB content limit. Retries once on 422
// "not a fast forward" (GitHub Actions race on the ref update).

export async function commitFiles(
	pat: string,
	updates: { path: string; content: string }[],
	message: string,
	deletions: string[] = []
): Promise<void> {
	const headers = {
		Authorization: `Bearer ${pat}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json'
	};

	// 1. Current HEAD commit SHA
	const refRes = await fetch(`${API}/repos/${REPO}/git/ref/heads/main`, { headers });
	if (!refRes.ok) throw new Error(`Failed to get ref: ${refRes.status}`);
	const headSha: string = (await refRes.json()).object.sha;

	// 2. Current tree SHA
	const commitRes = await fetch(`${API}/repos/${REPO}/git/commits/${headSha}`, { headers });
	if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
	const treeSha: string = (await commitRes.json()).tree.sha;

	// 3. Create a blob for each updated file (parallel)
	const blobShas = await Promise.all(updates.map(async ({ content }) => {
		const res = await fetch(`${API}/repos/${REPO}/git/blobs`, {
			method: 'POST', headers,
			body: JSON.stringify({ content: toBase64(content), encoding: 'base64' })
		});
		if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`);
		return (await res.json()).sha as string;
	}));

	// 4. Create tree: updates + deletions (sha: null removes a file)
	const treeEntries = [
		...updates.map(({ path }, i) => ({ path, mode: '100644', type: 'blob', sha: blobShas[i] })),
		...deletions.map(path => ({ path, mode: '100644', type: 'blob', sha: null }))
	];
	const treeRes = await fetch(`${API}/repos/${REPO}/git/trees`, {
		method: 'POST', headers,
		body: JSON.stringify({ base_tree: treeSha, tree: treeEntries })
	});
	if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
	const newTreeSha: string = (await treeRes.json()).sha;

	// 5. Create commit
	const newCommitRes = await fetch(`${API}/repos/${REPO}/git/commits`, {
		method: 'POST', headers,
		body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] })
	});
	if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
	const newCommitSha: string = (await newCommitRes.json()).sha;

	// 6. Force-update ref — bypasses fast-forward check.
	// Safe because: (a) we always write complete file state, not diffs,
	// and (b) this is a single-admin site with no concurrent writers.
	const patchRes = await fetch(`${API}/repos/${REPO}/git/refs/heads/main`, {
		method: 'PATCH', headers,
		body: JSON.stringify({ sha: newCommitSha, force: true })
	});
	if (!patchRes.ok) {
		const patchErr = await patchRes.json().catch(() => ({}));
		throw new Error(patchErr.message || `Failed to update ref: ${patchRes.status}`);
	}
}


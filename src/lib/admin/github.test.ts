import { describe, it, expect, vi, afterEach } from 'vitest';
import { validatePAT, getFile, putFile } from './github.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

// Helper: encode UTF-8 string to base64 (matching github.ts's toBase64)
function toBase64(str: string): string {
	return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(b64: string): string {
	return decodeURIComponent(escape(atob(b64)));
}

describe('toBase64 / fromBase64 round-trip (via getFile content flow)', () => {
	it('ASCII round-trip: encoding then decoding returns original string', () => {
		const original = 'Hello, world!';
		expect(fromBase64(toBase64(original))).toBe(original);
	});

	it('UTF-8 round-trip: handles non-ASCII characters', () => {
		const original = 'Héllo wörld — "quotes" & \'apostrophes\'';
		expect(fromBase64(toBase64(original))).toBe(original);
	});

	it('JSON round-trip: handles JSON content', () => {
		const original = JSON.stringify([{ title: 'Book', author: 'Ünïcode' }]);
		expect(fromBase64(toBase64(original))).toBe(original);
	});

	it('markdown round-trip: handles markdown with special chars', () => {
		const original = '# Title\n\n**bold** and _italic_\n\n> blockquote\n';
		expect(fromBase64(toBase64(original))).toBe(original);
	});
});

describe('validatePAT', () => {
	it('returns true when GitHub API responds with 200', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
		const result = await validatePAT('ghp_validtoken');
		expect(result).toBe(true);
	});

	it('returns false when GitHub API responds with 401', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
		const result = await validatePAT('ghp_badtoken');
		expect(result).toBe(false);
	});

	it('returns false when GitHub API responds with 403', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
		const result = await validatePAT('ghp_expiredtoken');
		expect(result).toBe(false);
	});

	it('calls fetch with Authorization Bearer header', async () => {
		const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal('fetch', mockFetch);
		await validatePAT('ghp_mytoken');
		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toContain('/user');
		expect(options.headers.Authorization).toBe('Bearer ghp_mytoken');
	});
});

describe('getFile', () => {
	it('decodes base64 content correctly', async () => {
		const original = '# Hello\n\nSome content.';
		const b64 = toBase64(original);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ content: b64, sha: 'abc123' })
			})
		);
		const result = await getFile('ghp_token', 'src/lib/content.md');
		expect(result.content).toBe(original);
		expect(result.sha).toBe('abc123');
	});

	it('handles base64 content with embedded newlines (GitHub API style)', async () => {
		const original = 'Some file content with UTF-8: café';
		const b64WithNewlines = toBase64(original).replace(/(.{10})/g, '$1\n');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ content: b64WithNewlines, sha: 'def456' })
			})
		);
		const result = await getFile('ghp_token', 'some/path.md');
		expect(result.content).toBe(original);
	});

	it('throws FILE_NOT_FOUND on 404', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				json: () => Promise.resolve({ message: 'Not Found' })
			})
		);
		await expect(getFile('ghp_token', 'nonexistent.md')).rejects.toThrow('FILE_NOT_FOUND');
	});

	it('throws GitHub API error message on non-404 error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ message: 'Internal Server Error' })
			})
		);
		await expect(getFile('ghp_token', 'some/path.md')).rejects.toThrow('GitHub API error: 500');
	});

	it('calls fetch with correct URL and auth header', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ content: toBase64('content'), sha: 'sha1' })
		});
		vi.stubGlobal('fetch', mockFetch);
		await getFile('ghp_mytoken', 'src/lib/data.json');
		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toContain('src/lib/data.json');
		expect(options.headers.Authorization).toBe('Bearer ghp_mytoken');
	});
});

describe('putFile', () => {
	it('resolves successfully on 200 response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({})
			})
		);
		await expect(
			putFile('ghp_token', 'src/lib/file.md', '# Content', 'sha123', 'update file')
		).resolves.toBeUndefined();
	});

	it('throws on non-ok response with error message from body', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 422,
				json: () => Promise.resolve({ message: 'Validation Failed' })
			})
		);
		await expect(
			putFile('ghp_token', 'src/lib/file.md', '# Content', 'sha123', 'update file')
		).rejects.toThrow('Validation Failed');
	});

	it('throws with status-based message when body has no message field', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.resolve({})
			})
		);
		await expect(
			putFile('ghp_token', 'src/lib/file.md', '# Content', null, 'create file')
		).rejects.toThrow('GitHub API error: 500');
	});

	it('sends PUT request with correct method and headers', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		});
		vi.stubGlobal('fetch', mockFetch);
		await putFile('ghp_mytoken', 'src/lib/file.md', 'content', 'sha1', 'test commit');
		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, options] = mockFetch.mock.calls[0];
		expect(url).toContain('src/lib/file.md');
		expect(options.method).toBe('PUT');
		expect(options.headers.Authorization).toBe('Bearer ghp_mytoken');
		expect(options.headers['Content-Type']).toBe('application/json');
	});

	it('omits sha field from body when sha is null (new file creation)', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 201,
			json: () => Promise.resolve({})
		});
		vi.stubGlobal('fetch', mockFetch);
		await putFile('ghp_mytoken', 'src/lib/new.md', 'content', null, 'create file');
		const [, options] = mockFetch.mock.calls[0];
		const body = JSON.parse(options.body);
		expect(body).not.toHaveProperty('sha');
		expect(body).toHaveProperty('message', 'create file');
		expect(body).toHaveProperty('content');
	});

	it('includes sha field in body when sha is provided (update)', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		});
		vi.stubGlobal('fetch', mockFetch);
		await putFile('ghp_mytoken', 'src/lib/existing.md', 'content', 'abc123sha', 'update file');
		const [, options] = mockFetch.mock.calls[0];
		const body = JSON.parse(options.body);
		expect(body).toHaveProperty('sha', 'abc123sha');
	});

	it('content in request body is base64-encoded', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({})
		});
		vi.stubGlobal('fetch', mockFetch);
		const plainContent = 'Hello, world!';
		await putFile('ghp_mytoken', 'src/lib/file.md', plainContent, null, 'test');
		const [, options] = mockFetch.mock.calls[0];
		const body = JSON.parse(options.body);
		// Decode the base64 content back and verify it matches
		expect(fromBase64(body.content)).toBe(plainContent);
	});
});

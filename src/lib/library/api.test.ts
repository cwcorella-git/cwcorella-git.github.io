import { describe, it, expect, vi } from 'vitest';
import { createLibraryClient, serializeQuery, AuthError, OfflineError, ApiError } from './api.js';
import type { ListResponse, LibraryDoc, Facets } from './types.js';

const BASE_URL = 'https://library.example.com/api';
const TOKEN = 'test-bearer-token';

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body)
	};
}

describe('serializeQuery', () => {
	it('omits undefined, null, and empty-string fields', () => {
		const qs = serializeQuery({ sort: undefined, dir: undefined, q: '', cursor: null });
		expect(qs).toBe('');
	});

	it('includes set fields', () => {
		const qs = serializeQuery({ sort: 'author', dir: 'desc', limit: 50 });
		const params = new URLSearchParams(qs);
		expect(params.get('sort')).toBe('author');
		expect(params.get('dir')).toBe('desc');
		expect(params.get('limit')).toBe('50');
	});

	it('has no leading question mark', () => {
		const qs = serializeQuery({ q: 'x' });
		expect(qs.startsWith('?')).toBe(false);
	});
});

describe('createLibraryClient', () => {
	it('sends Authorization Bearer header and credentials:"omit" on listDocuments', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], next_cursor: null, total: 0 }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		await client.listDocuments();

		expect(fetchImpl).toHaveBeenCalledOnce();
		const [, options] = fetchImpl.mock.calls[0];
		expect(options.headers.Authorization).toBe('Bearer ' + TOKEN);
		expect(options.credentials).toBe('omit');
	});

	it('serializes query params on listDocuments and omits empty fields', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], next_cursor: null, total: 0 }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		await client.listDocuments({
			sort: 'author',
			dir: 'desc',
			q: 'x',
			language: 'en',
			cursor: 'C',
			limit: 50
		});

		const [url] = fetchImpl.mock.calls[0];
		expect(url.startsWith(BASE_URL + '/documents?')).toBe(true);
		const params = new URL(url).searchParams;
		expect(params.get('sort')).toBe('author');
		expect(params.get('dir')).toBe('desc');
		expect(params.get('q')).toBe('x');
		expect(params.get('language')).toBe('en');
		expect(params.get('cursor')).toBe('C');
		expect(params.get('limit')).toBe('50');
		// no extraneous keys from unset fields
		expect(params.has('source')).toBe(false);
		expect(params.has('collection')).toBe(false);
		expect(params.has('tag')).toBe(false);
		expect(params.has('visibility')).toBe(false);
		expect(params.has('needs_formatting')).toBe(false);
	});

	it('hits /documents/:id on getDocument', async () => {
		const doc: LibraryDoc = {
			id: 7,
			source: 'src',
			slug: 'slug',
			title: 'Title',
			author: null,
			publication_date: null,
			language: 'en',
			document_type: 'book',
			word_count: 100,
			char_count: 500,
			visibility: 'public',
			needs_formatting: false,
			updated_at: '2026-01-01',
			tags: [],
			collections: [],
			body: 'body text'
		};
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, doc));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		const result = await client.getDocument(7);

		const [url] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7');
		expect(result).toEqual(doc);
	});

	it('hits /facets on getFacets', async () => {
		const facets: Facets = {
			languages: [{ name: 'en', count: 10 }],
			sources: [],
			collections: [],
			tags: []
		};
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, facets));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		const result = await client.getFacets();

		const [url] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/facets');
		expect(result).toEqual(facets);
	});

	it('returns the parsed body on a 200 response for listDocuments', async () => {
		const body: ListResponse = { items: [], next_cursor: 'abc', total: 42 };
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, body));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		const result = await client.listDocuments();
		expect(result).toEqual(body);
	});

	it('throws AuthError on 401', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'unauthorized' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		await expect(client.listDocuments()).rejects.toBeInstanceOf(AuthError);
	});

	it('throws OfflineError when fetch throws (network/timeout)', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network error'));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		await expect(client.listDocuments()).rejects.toBeInstanceOf(OfflineError);
	});

	it('throws ApiError with status and detail on 400', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { detail: 'bad' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		try {
			await client.listDocuments();
			expect.unreachable('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			expect((e as ApiError).status).toBe(400);
			expect((e as ApiError).detail).toBe('bad');
		}
	});

	it('throws ApiError on 500', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		await expect(client.listDocuments()).rejects.toBeInstanceOf(ApiError);
	});

	it('guards against non-JSON error bodies when constructing ApiError', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			status: 502,
			json: () => Promise.reject(new Error('not json'))
		});
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });

		try {
			await client.listDocuments();
			expect.unreachable('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			expect((e as ApiError).status).toBe(502);
			expect((e as ApiError).detail).toBeUndefined();
		}
	});
});

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

describe('serializeQuery arrays', () => {
	it('emits one param per array element', () => {
		expect(serializeQuery({ tag: ['a', 'b'] })).toBe('tag=a&tag=b');
	});

	it('emits a single param for a one-element array', () => {
		expect(serializeQuery({ tag: ['a'] })).toBe('tag=a');
	});

	it('omits an empty array entirely', () => {
		expect(serializeQuery({ tag: [], sort: 'title' })).toBe('sort=title');
	});

	it('skips empty strings inside an array', () => {
		expect(serializeQuery({ tag: ['a', '', 'b'] })).toBe('tag=a&tag=b');
	});

	it('still serializes scalars unchanged', () => {
		expect(serializeQuery({ sort: 'title', dir: 'asc' })).toBe('sort=title&dir=asc');
	});

	it('keeps 0 — it is a real value, not empty', () => {
		expect(serializeQuery({ needs_formatting: 0 })).toBe('needs_formatting=0');
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
			decision: null,
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

describe('curation writes', () => {
	it('setCuration PUTs /curation/{id} with a JSON body and bearer header', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { doc_id: 7, decision: 'keep' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		const res = await client.setCuration(7, 'keep');
		expect(res).toEqual({ doc_id: 7, decision: 'keep' });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/curation/7');
		expect(options.method).toBe('PUT');
		expect(options.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(options.body)).toEqual({ decision: 'keep' });
		expect(options.headers.Authorization).toBe('Bearer ' + TOKEN);
	});

	it('getCurationStats GETs /curation/stats', async () => {
		const stats = { keep: 1, hide: 0, delete: 0, decided: 1, total: 10, undecided: 9 };
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, stats));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.getCurationStats()).toEqual(stats);
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/curation/stats');
		expect(options.method ?? 'GET').toBe('GET');
		expect(options.body).toBeUndefined();
	});

	it('setCuration maps 404 to ApiError', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'document not found' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await expect(client.setCuration(999, 'keep')).rejects.toBeInstanceOf(ApiError);
	});
});

describe('edit methods', () => {
	it('saveBody PUTs body to /documents/{id}/body', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7, body: 'b', edited: true }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await client.saveBody(7, { body: 'b', title: 'T', needs_formatting: null, tags: ['x'] });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/body');
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body)).toEqual({ body: 'b', title: 'T', needs_formatting: null, tags: ['x'] });
	});

	it('getVersions unwraps {versions}', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { versions: [{ version_id: 3, title: null, created_at: 't' }] }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.getVersions(7)).toEqual([{ version_id: 3, title: null, created_at: 't' }]);
	});

	it('revertDoc POSTs the target', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7, edited: false }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await client.revertDoc(7, { original: true });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/revert');
		expect(options.method).toBe('POST');
		expect(JSON.parse(options.body)).toEqual({ original: true });
	});

	it('downloadMarkdown returns raw text with auth header', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('# md') });
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.downloadMarkdown(7)).toBe('# md');
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/download');
		expect(options.headers.Authorization).toBe('Bearer ' + TOKEN);
	});
});

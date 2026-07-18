import type {
	LibraryDoc,
	LibraryQuery,
	ListResponse,
	Facets,
	FacetBucket,
	AnchorOffsetParams,
	AnchorOffsetResponse,
	DecisionInput,
	CurationStats,
	DocVersion,
	EditPayload
} from './types';

export class AuthError extends Error {
	constructor(message = 'Authentication failed.') {
		super(message);
		this.name = 'AuthError';
	}
}

export class OfflineError extends Error {
	constructor(message = 'Network request failed.') {
		super(message);
		this.name = 'OfflineError';
	}
}

export class ApiError extends Error {
	status: number;
	detail?: string;

	constructor(status: number, detail?: string) {
		super(detail ? `API error ${status}: ${detail}` : `API error ${status}`);
		this.name = 'ApiError';
		this.status = status;
		this.detail = detail;
	}
}

export function serializeQuery(q: object): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(q)) {
		if (value === undefined || value === null || value === '') continue;
		// Arrays become repeated params (tag=a&tag=b), which is how the API ANDs
		// multiple tags. URLSearchParams.set() would stringify to "a,b" — one tag
		// with a comma in its name.
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item === undefined || item === null || item === '') continue;
				params.append(key, String(item));
			}
			continue;
		}
		params.set(key, String(value));
	}
	return params.toString();
}

type FetchImpl = typeof fetch;

interface CreateLibraryClientOptions {
	baseUrl: string;
	getToken: () => string;
	fetchImpl?: FetchImpl;
}

export function createLibraryClient({ baseUrl, getToken, fetchImpl = fetch }: CreateLibraryClientOptions) {
	async function request<T>(
		path: string,
		options: { query?: object; method?: string; body?: unknown } = {}
	): Promise<T> {
		const qs = options.query ? serializeQuery(options.query) : '';
		const url = baseUrl.replace(/\/$/, '') + path + (qs ? '?' + qs : '');

		const headers: Record<string, string> = { Authorization: 'Bearer ' + getToken() };
		const init: RequestInit = {
			method: options.method ?? 'GET',
			headers,
			credentials: 'omit'
		};
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
			init.body = JSON.stringify(options.body);
		}

		let res: Response;
		try {
			res = await fetchImpl(url, init);
		} catch {
			throw new OfflineError();
		}

		if (res.status === 401) {
			throw new AuthError();
		}

		if (!res.ok) {
			let detail: string | undefined;
			try {
				const body = await res.json();
				detail = body?.detail;
			} catch {
				detail = undefined;
			}
			throw new ApiError(res.status, detail);
		}

		return res.json();
	}

	return {
		async listDocuments(query: LibraryQuery = {}): Promise<ListResponse> {
			// Normalize tags at the API boundary: the deployed library-api may not
			// have shipped tags-in-rows enrichment yet, so /documents rows can
			// arrive with no `tags` key even though DocListItem types it non-optional.
			// Fix here once rather than defensive `?.` guards at every render site.
			const res = await request<ListResponse>('/documents', { query });
			for (const it of res.items) {
				if (it.tags == null) it.tags = [];
			}
			return res;
		},
		getDocument(id: number | string): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id);
		},
		getFacets(source?: string): Promise<Facets> {
			// `source` narrows collections/tags/visibility/needs_formatting/date_range.
			// languages/sources stay global — they are how the UI navigates back out.
			return request<Facets>('/facets', { query: source ? { source } : {} });
		},
		async searchTags(q: string, limit = 50): Promise<FacetBucket[]> {
			// The /facets tags list is capped at 200 while the corpus has ~12k distinct
			// tags. This reaches the tail.
			const res = await request<{ tags: FacetBucket[] }>('/tags', { query: { q, limit } });
			return res.tags;
		},
		getAnchorOffset(params: AnchorOffsetParams): Promise<AnchorOffsetResponse> {
			return request<AnchorOffsetResponse>('/anchor-offset', {
				query: params
			});
		},
		setCuration(id: number | string, decision: DecisionInput): Promise<{ doc_id: number; decision: string }> {
			return request('/curation/' + id, { method: 'PUT', body: { decision } });
		},
		getCurationStats(): Promise<CurationStats> {
			return request<CurationStats>('/curation/stats');
		},
		saveBody(id: number | string, payload: EditPayload): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id + '/body', { method: 'PUT', body: payload });
		},
		async getVersions(id: number | string): Promise<DocVersion[]> {
			const res = await request<{ versions: DocVersion[] }>('/documents/' + id + '/versions');
			return res.versions;
		},
		revertDoc(id: number | string, target: { version_id: number } | { original: true }): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id + '/revert', { method: 'POST', body: target });
		},
		async downloadMarkdown(id: number | string): Promise<string> {
			const url = baseUrl.replace(/\/$/, '') + '/documents/' + id + '/download';
			const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + getToken() }, credentials: 'omit' });
			if (res.status === 401) throw new AuthError();
			if (!res.ok) throw new ApiError(res.status);
			return res.text();
		}
	};
}

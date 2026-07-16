import type {
	LibraryDoc,
	LibraryQuery,
	ListResponse,
	Facets,
	AnchorOffsetParams,
	AnchorOffsetResponse
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

export function serializeQuery(q: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(q)) {
		if (value === undefined || value === null || value === '') continue;
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
		options: { query?: Record<string, unknown> } = {}
	): Promise<T> {
		const qs = options.query ? serializeQuery(options.query) : '';
		const url = baseUrl.replace(/\/$/, '') + path + (qs ? '?' + qs : '');

		let res: Response;
		try {
			res = await fetchImpl(url, {
				headers: { Authorization: 'Bearer ' + getToken() },
				credentials: 'omit'
			});
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
		listDocuments(query: LibraryQuery = {}): Promise<ListResponse> {
			return request<ListResponse>('/documents', { query: query as Record<string, unknown> });
		},
		getDocument(id: number | string): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id);
		},
		getFacets(): Promise<Facets> {
			return request<Facets>('/facets');
		},
		getAnchorOffset(params: AnchorOffsetParams): Promise<AnchorOffsetResponse> {
			return request<AnchorOffsetResponse>('/anchor-offset', {
				query: params as unknown as Record<string, unknown>
			});
		}
	};
}

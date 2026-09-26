// A document's address cannot be prerendered: there are ~100k of them and the
// corpus is private. The host serves the SPA shell for /library/* (static/_redirects),
// and everything happens in the browser, as on /library.
export const prerender = false;
export const ssr = false;

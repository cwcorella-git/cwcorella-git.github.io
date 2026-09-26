// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** This entry was pushed by opening a document from the list: closing it goes Back. */
			libraryDoc?: boolean;
		}
		// interface Platform {}
	}
}

export {};

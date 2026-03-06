<script lang="ts">
	import { untrack } from 'svelte';
	import type { Book, BookDoc, BookLink } from '$lib/types';
	import { adminState, booksState, writeQueue } from '$lib/admin/state.svelte';
	import { encryptDoc } from '$lib/admin/crypto';
	import { toast } from '$lib/admin/toast.svelte';
	import { addAgeUnits } from '$lib/garden/state';
	import allBooksStatic from '$lib/books.json';
	import YearPicker from '$lib/components/YearPicker.svelte';

	let {
		book,
		onClose,
		onSaved
	}: {
		book: Book | null;
		onClose: () => void;
		onSaved: (books: Book[]) => void;
	} = $props();

	// Snapshot initial prop value — form fields intentionally only capture this once
	const _book = untrack(() => book);
	const isNew = _book === null;

	// Derive all existing categories for datalist
	const allCategories = [...new Set((allBooksStatic as Book[]).map((b) => b.category))].sort();

	// Form fields
	let title = $state(_book?.title ?? '');
	let author = $state(_book?.author ?? '');
	let year = $state(_book?.year?.toString() ?? '');
	let category = $state(_book?.category ?? '');
	let links = $state<BookLink[]>(_book?.links ? [..._book.links.map(l => ({ ...l }))] : []);
	let notes = $state(_book?.notes ?? '');

	function addLink() { links = [...links, { name: '', url: '' }]; }
	function removeLink(i: number) { links = links.filter((_, idx) => idx !== i); }
	let docVisibility = $state<'public' | 'admin'>(_book?.doc?.visibility ?? 'public');
	let docContent = $state('');

	let saving = $state(false);
	let deleting = $state(false);
	let validationError = $state('');

	function slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/[\s_]+/g, '-')
			.slice(0, 40);
	}

	async function save() {
		if (!title.trim() || !author.trim() || !category.trim()) {
			validationError = 'Title, author, and category are required.';
			return;
		}
		saving = true;
		validationError = '';
		try {
			const books: Book[] = booksState.books;
			const newId = isNew
				? Math.max(...books.map((b) => b.id)) + 1
				: book!.id;

			const slug = `${newId}-${slugify(title)}`;

			let doc: BookDoc | undefined = book?.doc;
			const extraUpdates: { path: string; content: string }[] = [];

			if (docContent.trim()) {
				if (docVisibility === 'admin') {
					const encrypted = await encryptDoc(docContent.trim(), adminState.contentKey);
					extraUpdates.push({ path: `static/docs/private/${slug}.enc`, content: JSON.stringify(encrypted) });
				} else {
					extraUpdates.push({ path: `static/docs/public/${slug}.md`, content: docContent.trim() });
				}
				doc = { file: slug, visibility: docVisibility };
			}

			const validLinks = links.filter(l => l.name.trim() && l.url.trim())
				.map(l => ({ name: l.name.trim(), url: l.url.trim() }));

			const entry: Book = {
				id: newId,
				title: title.trim(),
				author: author.trim(),
				year: year ? parseInt(year, 10) : null,
				category: category.trim(),
				...(validLinks.length ? { links: validLinks } : {}),
				...(notes.trim() ? { notes: notes.trim() } : {}),
				...(doc ? { doc } : {})
			};

			let updatedBooks: Book[];
			if (isNew) {
				updatedBooks = [...books, entry];
			} else {
				updatedBooks = books.map((b) => (b.id === newId ? entry : b));
			}

			writeQueue.push({ domain: 'books', books: updatedBooks, extraUpdates });
			booksState.set(updatedBooks);
			addAgeUnits(5);
			onSaved(updatedBooks);
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			saving = false;
		}
	}

	async function deleteBook() {
		if (!book) return;
		deleting = true;
		try {
			const books: Book[] = booksState.books;
			const updatedBooks = books.filter((b) => b.id !== book!.id);
			const deletions: string[] = [];
			if (book.doc) {
				const dir = book.doc.visibility === 'admin' ? 'private' : 'public';
				const ext = book.doc.visibility === 'admin' ? 'enc' : 'md';
				deletions.push(`static/docs/${dir}/${book.doc.file}.${ext}`);
			}
			writeQueue.push({ domain: 'books', books: updatedBooks, deletions });
			booksState.set(updatedBooks);
			onSaved(updatedBooks);
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : 'Delete failed.');
		} finally {
			deleting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
		if (e.key === 'Tab') trapFocus(e);
	}

	let dialogEl = $state<HTMLElement>();
	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		const focusable = (dialogEl as HTMLElement).querySelectorAll<HTMLElement>(
			'input, textarea, button, select, [tabindex]:not([tabindex="-1"])'
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first) { e.preventDefault(); last.focus(); }
		} else {
			if (document.activeElement === last) { e.preventDefault(); first.focus(); }
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div
	class="modal"
	role="dialog"
	aria-modal="true"
	aria-label={isNew ? 'Add book' : 'Edit book'}
	bind:this={dialogEl}
>
	<div class="modal-header">
		<span class="modal-title">{isNew ? 'add book' : 'edit book'}</span>
		<button class="close-btn" onclick={onClose} aria-label="Close">×</button>
	</div>

	<div class="modal-body">
		<div class="fields">
			<label>
				<span>Title *</span>
				<input type="text" bind:value={title} />
			</label>
			<label>
				<span>Author *</span>
				<input type="text" bind:value={author} />
			</label>
			<div class="row">
				<label>
					<span>Year</span>
					<YearPicker value={year ? parseInt(year) : null} onchange={(y) => year = y?.toString() ?? ''} />
				</label>
				<label>
					<span>Category *</span>
					<input type="text" bind:value={category} list="categories" />
					<datalist id="categories">
						{#each allCategories as cat}
							<option value={cat}></option>
						{/each}
					</datalist>
				</label>
			</div>

			<fieldset>
				<legend>Sources</legend>
				{#each links as link, i}
					<div class="link-row">
						<input type="text" bind:value={link.name} placeholder="Source name" />
						<input type="url" bind:value={link.url} placeholder="https://…" />
						<button type="button" class="remove-link" onclick={() => removeLink(i)} aria-label="Remove source">×</button>
					</div>
				{/each}
				<button type="button" class="add-link" onclick={addLink}>+ add source</button>
			</fieldset>

			<label>
				<span>Notes (admin-only)</span>
				<textarea bind:value={notes} rows={3} placeholder="Private annotations…"></textarea>
			</label>

			<fieldset>
				<legend>Document</legend>
				<div class="visibility-row">
					<span>Visibility</span>
					<label class="radio">
						<input type="radio" bind:group={docVisibility} value="public" />
						public
					</label>
					<label class="radio">
						<input type="radio" bind:group={docVisibility} value="admin" />
						admin (encrypted)
					</label>
				</div>
				<label>
					<span>Markdown content (leave empty to keep existing)</span>
					<textarea bind:value={docContent} rows={10} placeholder="# Title&#10;&#10;Paste markdown…"></textarea>
				</label>
			</fieldset>
		</div>

		{#if validationError}
			<p class="error">{validationError}</p>
		{/if}

		<div class="modal-footer">
			{#if !isNew}
				<button class="delete-btn" onclick={deleteBook} disabled={deleting || saving}>
					{deleting ? 'deleting…' : 'delete'}
				</button>
			{/if}
			<div class="footer-right">
				<button onclick={onClose} disabled={saving || deleting}>cancel</button>
				<button class="save-btn" onclick={save} disabled={saving || deleting}>
					{saving ? 'saving…' : 'save'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 490;
		background: rgba(0, 0, 0, 0.6);
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 491;
		background: #120e04;
		border: 1px solid rgba(200, 150, 60, 0.3);
		width: min(600px, 95vw);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.2rem 1.6rem;
		border-bottom: 1px solid rgba(200, 150, 60, 0.12);
		flex-shrink: 0;
	}

	.modal-title {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c8a060;
	}

	.close-btn {
		background: none;
		border: none;
		color: #6a5a40;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.15s;
	}
	.close-btn:hover { color: #c8a060; }

	.modal-body {
		overflow-y: auto;
		padding: 1.4rem 1.6rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	label span, legend {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6a5a40;
	}

	input[type="text"],
	input[type="url"],
	textarea {
		background: rgba(200, 150, 60, 0.04);
		border: 1px solid rgba(200, 150, 60, 0.18);
		color: #c0b088;
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 0.88rem;
		padding: 0.45rem 0.6rem;
		outline: none;
		transition: border-color 0.15s;
		width: 100%;
	}
	input:focus, textarea:focus { border-color: rgba(200, 150, 60, 0.45); }
	textarea { resize: vertical; font-family: 'Courier New', Courier, monospace; font-size: 0.78rem; }

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
	}

	fieldset {
		border: 1px solid rgba(200, 150, 60, 0.12);
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.link-row {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		gap: 0.4rem;
		align-items: center;
	}
	.link-row input { width: 100%; }

	.remove-link {
		background: none;
		border: none;
		color: #6a5a40;
		font-size: 1rem;
		cursor: pointer;
		padding: 0 0.2rem;
		line-height: 1;
		transition: color 0.15s;
		flex-shrink: 0;
	}
	.remove-link:hover { color: #c07060; }

	.add-link {
		background: none;
		border: 1px dashed rgba(200, 150, 60, 0.2);
		color: #6a5a40;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.3rem 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		align-self: flex-start;
	}
	.add-link:hover { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }

	.visibility-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		color: #6a5a40;
	}

	.radio {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.65rem;
		color: #8a7858;
	}
	.radio input { width: auto; }

	.error {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		color: #c07050;
		margin: 0;
	}

	.modal-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 0.8rem;
		border-top: 1px solid rgba(200, 150, 60, 0.08);
	}

	.footer-right {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	button {
		background: none;
		border: 1px solid rgba(200, 150, 60, 0.2);
		color: #6a5a40;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		padding: 0.35rem 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	button:hover:not(:disabled) { color: #c8a060; border-color: rgba(200, 150, 60, 0.45); }
	button:disabled { opacity: 0.5; cursor: not-allowed; }

	.save-btn {
		background: rgba(200, 150, 60, 0.08);
		border-color: rgba(200, 150, 60, 0.35);
		color: #c8a060;
	}

	.delete-btn {
		border-color: rgba(180, 60, 60, 0.3);
		color: #8a4040;
	}
	.delete-btn:hover:not(:disabled) { color: #c06060; border-color: rgba(180, 60, 60, 0.6); background: rgba(180, 60, 60, 0.06); }
</style>

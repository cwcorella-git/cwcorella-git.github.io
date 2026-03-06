<script lang="ts">
	import { untrack } from 'svelte';
	let {
		value,
		onchange
	}: {
		value: number | null;
		onchange: (year: number | null) => void;
	} = $props();

	const currentYear = new Date().getFullYear();

	let open = $state(false);
	// $effect below handles reactive sync; untrack here intentionally captures only initial value
	let decadeStart = $state(untrack(() => Math.floor((value ?? currentYear) / 12) * 12));
	let inputVal = $state(untrack(() => value != null ? String(value) : ''));

	// Sync inputVal when value prop changes externally
	$effect(() => {
		inputVal = value != null ? String(value) : '';
	});

	function toggleDropdown() {
		if (!open) {
			// Re-centre decade on current value when opening
			decadeStart = Math.floor(((value ?? currentYear) - 1) / 12) * 12;
		}
		open = !open;
	}

	function selectYear(y: number) {
		onchange(y);
		open = false;
	}

	function prevDecade() {
		decadeStart -= 12;
	}

	function nextDecade() {
		decadeStart += 12;
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Tab') {
			commitInput();
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	function commitInput() {
		const trimmed = inputVal.trim();
		if (trimmed === '') {
			onchange(null);
		} else {
			const n = parseInt(trimmed, 10);
			if (!isNaN(n) && String(n).length === 4) {
				onchange(n);
			} else {
				// Restore to last known good value
				inputVal = value != null ? String(value) : '';
			}
		}
		open = false;
	}

	function handleWrapperKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}

	function handleClickOutside(node: HTMLElement) {
		function onClick(e: MouseEvent) {
			if (!node.contains(e.target as Node)) {
				open = false;
			}
		}
		document.addEventListener('click', onClick, true);
		return {
			destroy() {
				document.removeEventListener('click', onClick, true);
			}
		};
	}

	// Build the 12-year grid
	let years = $derived(Array.from({ length: 12 }, (_, i) => decadeStart + i));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="year-picker-wrapper" use:handleClickOutside onkeydown={handleWrapperKeydown}>
	<div class="year-input-row">
		<input
			class="year-input"
			type="text"
			inputmode="numeric"
			maxlength="4"
			placeholder="YYYY"
			bind:value={inputVal}
			onkeydown={handleInputKeydown}
			onblur={commitInput}
		/>
		<button
			type="button"
			class="cal-btn"
			aria-label="Open year picker"
			onclick={toggleDropdown}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="4" width="18" height="18" rx="2"/>
				<line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/>
				<line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
		</button>
	</div>

	{#if open}
		<div class="dropdown" role="dialog" aria-label="Year picker">
			<div class="dropdown-nav">
				<button type="button" class="nav-btn" onclick={prevDecade} aria-label="Previous years">‹</button>
				<span class="decade-label">{decadeStart}–{decadeStart + 11}</span>
				<button type="button" class="nav-btn" onclick={nextDecade} aria-label="Next years">›</button>
			</div>
			<div class="year-grid">
				{#each years as y}
					<button
						type="button"
						class="year-btn"
						class:selected={y === value}
						class:current={y === currentYear}
						onclick={() => selectYear(y)}
					>
						{y}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.year-picker-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.year-input-row {
		display: flex;
		align-items: stretch;
		border: 1px solid rgba(200, 150, 60, 0.18);
		background: rgba(200, 150, 60, 0.04);
		transition: border-color 0.15s;
	}
	.year-input-row:focus-within {
		border-color: rgba(200, 150, 60, 0.45);
	}

	.year-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: #c0b088;
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 0.88rem;
		padding: 0.45rem 0.6rem;
		/* Remove browser number spinners */
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.year-input::-webkit-outer-spin-button,
	.year-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}

	.cal-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-left: 1px solid rgba(200, 150, 60, 0.18);
		color: #6a5a40;
		padding: 0 0.5rem;
		cursor: pointer;
		transition: color 0.15s;
		font-size: inherit;
		font-family: inherit;
		letter-spacing: inherit;
	}
	.cal-btn:hover {
		color: #c8a060;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 50;
		background: #0c0902;
		border: 1px solid rgba(200, 150, 60, 0.35);
		padding: 0.6rem;
		min-width: 200px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
	}

	.dropdown-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.decade-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		color: #6a5a40;
		text-transform: uppercase;
	}

	.nav-btn {
		background: none;
		border: none;
		color: #6a5a40;
		font-size: 1rem;
		cursor: pointer;
		padding: 0 0.4rem;
		line-height: 1;
		font-family: inherit;
		letter-spacing: inherit;
		transition: color 0.15s;
	}
	.nav-btn:hover {
		color: #c8a060;
	}

	.year-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.25rem;
	}

	.year-btn {
		background: none;
		border: 1px solid transparent;
		color: #c0b088;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		padding: 0.3rem 0.1rem;
		cursor: pointer;
		text-align: center;
		transition: all 0.12s;
	}
	.year-btn:hover {
		color: #c8a060;
		border-color: rgba(200, 150, 60, 0.35);
		background: rgba(200, 150, 60, 0.06);
	}
	.year-btn.current {
		color: #c8a060;
	}
	.year-btn.selected {
		background: rgba(200, 150, 60, 0.15);
		border-color: rgba(200, 150, 60, 0.5);
		color: #c8a060;
	}
</style>

<script>
	const lately = [
		{ label: 'making', text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.' },
		{ label: 'reading', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
		{ label: 'thinking', text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit ut labore et dolore.' }
	];
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Reno, NV." />
</svelte:head>

<div class="page">
	<div class="glow" aria-hidden="true"></div>

	<header>
		<span>cwcorella</span>
	</header>

	<main>
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
			ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation —
			duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat.
		</p>
		<p>
			Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
			anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem
			totam rem aperiam, eaque ipsa quae ab illo inventore veritatis.
		</p>

		<ul class="lately">
			{#each lately as item}
				<li>
					<span class="k">{item.label}</span>
					<span class="v">{item.text}</span>
				</li>
			{/each}
		</ul>
	</main>

	<footer>
		<a href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github</a>
	</footer>
</div>

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #0c0902;
		color: #b8a880;
		font-family: Georgia, 'Times New Roman', Times, serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }

	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background-image:
			linear-gradient(rgba(200, 150, 60, 0.016) 1px, transparent 1px),
			linear-gradient(90deg, rgba(200, 150, 60, 0.016) 1px, transparent 1px);
		background-size: 48px 48px;
	}

	.glow {
		position: fixed;
		top: 35%; left: 30%;
		width: 700px; height: 700px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(200, 120, 40, 0.06) 0%, transparent 65%);
		animation: breathe 18s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
	}
	@keyframes breathe {
		0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
		50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.2); }
	}

	header {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-size: 0.8rem;
		color: #4a3e26;
		letter-spacing: 0.04em;
	}

	main {
		position: relative;
		z-index: 1;
		flex: 1;
		max-width: 560px;
		margin: 0 auto;
		padding: 6rem 2rem 4rem;
		width: 100%;
	}

	main p {
		font-size: 1rem;
		line-height: 1.9;
		color: #9a8a68;
		margin-bottom: 1.5rem;
	}

	.lately {
		list-style: none;
		margin: 3rem 0 0; padding: 0;
		border-top: 1px solid rgba(200, 150, 60, 0.08);
		padding-top: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lately li {
		display: grid;
		grid-template-columns: 90px 1fr;
		gap: 1rem;
		align-items: baseline;
	}
	.k {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c8a060;
	}
	.v {
		font-size: 0.88rem;
		line-height: 1.6;
		color: #6a5c3a;
		font-style: italic;
	}

	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: #3a3020;
	}
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: #c8a060; }

	@media (max-width: 600px) {
		.lately li { grid-template-columns: 1fr; gap: 0.2rem; }
	}
</style>

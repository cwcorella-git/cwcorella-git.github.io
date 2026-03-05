<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Reno, NV." />
</svelte:head>

<div class="page">
	<div class="glow" aria-hidden="true"></div>

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

		<blockquote>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.
		</blockquote>
	</main>

	<footer>
		<a href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github</a>
	</footer>
</div>

<style>
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

	main {
		position: relative;
		z-index: 1;
		flex: 1;
		max-width: 560px;
		margin: 0 auto;
		padding: 2rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	main p {
		font-size: 1rem;
		line-height: 1.9;
		color: #b8a880;
		margin-bottom: 1.5rem;
	}

	blockquote {
		margin: 1.5rem 0 0;
		padding: 0;
		border: none;
		font-size: 1rem;
		line-height: 1.9;
		color: #7a6a4a;
		font-style: italic;
	}

	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: #5a4e38;
	}
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: #c8a060; }
</style>

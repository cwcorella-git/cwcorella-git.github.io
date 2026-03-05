<script>
	const projects = [
		{
			id: 'veritable-games',
			title: 'Veritable Games',
			category: 'PLATFORM',
			year: '2024–',
			blurb:
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.'
		},
		{
			id: 'rstu-connect',
			title: 'RSTU Connect',
			category: 'CIVIC',
			year: '2024',
			blurb:
				'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident deserunt.'
		},
		{
			id: 'reno-dev-space',
			title: 'Reno Dev Space',
			category: 'CIVIC',
			year: '2023–',
			blurb:
				'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse.'
		},
	];

	const cat = {
		PLATFORM: '#c8793a',
		CIVIC: '#b83232'
	};
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Game designer, civic technologist, open source builder — Reno, NV." />
</svelte:head>

<div class="field">
	<div class="ambient" aria-hidden="true"></div>

	<nav>
		<span class="nav-id">cwcorella</span>
		<span class="nav-links">
			<a href="#work">work</a>
			<a href="#about">about</a>
		</span>
	</nav>

	<header class="hero">
		<div class="hero-inner">
			<p class="hero-pre">— index</p>
			<h1>
				<span class="dim">cw</span>corella
			</h1>
			<p class="hero-sub">GAME DESIGN&ensp;/&ensp;CIVIC TECH&ensp;/&ensp;OPEN SOURCE&ensp;/&ensp;RENO NV</p>
		</div>
		<div class="coord" aria-hidden="true">39.5296° N / 119.8138° W</div>
	</header>

	<section id="work" class="work">
		<h2 class="section-label">WORK</h2>
		<div class="grid">
			{#each projects as p}
				<article class="card" style="--c: {cat[p.category]}">
					<div class="card-top">
						<span class="card-cat">{p.category}</span>
						<span class="card-year">{p.year}</span>
					</div>
					<h3 class="card-title">{p.title}</h3>
					<p class="card-blurb">{p.blurb}</p>
				</article>
			{/each}
		</div>
	</section>

	<section id="about" class="about">
		<h2 class="section-label">ABOUT</h2>
		<div class="about-body">
			<p class="lede">
				Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
				ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
				ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure.
			</p>
			<p>
				Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
				laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi
				architecto beatae vitae dicta sunt explicabo nemo enim ipsam voluptatem.
			</p>
			<p>
				At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
				voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint
				occaecati cupiditate non provident similique sunt in culpa qui officia deserunt.
			</p>
		</div>
	</section>

	<footer>
		<span>cwcorella&ensp;—&ensp;{new Date().getFullYear()}</span>
		<a href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github</a>
	</footer>
</div>

<style>
	/* ── tokens ─────────────────────────────────────────────── */
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0;
		padding: 0;
		background: #080808;
		color: #d0cdc8;
		font-family: system-ui, -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }

	/* ── field + grid texture ────────────────────────────────── */
	.field {
		min-height: 100vh;
		position: relative;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
		background-size: 48px 48px;
	}

	/* ── ambient glow ────────────────────────────────────────── */
	.ambient {
		position: fixed;
		top: 40%;
		left: 38%;
		width: 700px;
		height: 700px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle, rgba(200, 121, 58, 0.045) 0%, transparent 68%);
		animation: breathe 14s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
	}
	@keyframes breathe {
		0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.6; }
		50%       { transform: translate(-50%, -50%) scale(1.3); opacity: 1;   }
	}

	/* ── nav ─────────────────────────────────────────────────── */
	nav {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 100;
		padding: 1.1rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		background: rgba(8, 8, 8, 0.88);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}
	.nav-id { color: #3a3a3a; }
	.nav-links { display: flex; gap: 2.5rem; }
	.nav-links a {
		color: #555;
		text-decoration: none;
		transition: color 0.2s;
	}
	.nav-links a:hover { color: #d0cdc8; }

	/* ── hero ────────────────────────────────────────────────── */
	.hero {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 8rem 2rem 4rem;
	}
	.hero-inner {
		max-width: 1280px;
		margin: 0 auto;
		width: 100%;
	}
	.hero-pre {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem;
		letter-spacing: 0.18em;
		color: #c8793a;
		text-transform: uppercase;
		margin-bottom: 1.2rem;
	}
	h1 {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: clamp(4.5rem, 11vw, 11rem);
		font-weight: 400;
		line-height: 0.88;
		letter-spacing: -0.025em;
		color: #d0cdc8;
		margin: 0 0 2.5rem;
	}
	.dim { color: #252525; }
	.hero-sub {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.22em;
		color: #404040;
		text-transform: uppercase;
	}
	.coord {
		position: absolute;
		bottom: 2.5rem;
		right: 2rem;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.15em;
		color: #252525;
		text-transform: uppercase;
	}

	/* ── section label ───────────────────────────────────────── */
	.section-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.28em;
		color: #303030;
		text-transform: uppercase;
		font-weight: 400;
		margin-bottom: 3rem;
		padding-bottom: 0.8rem;
		border-bottom: 1px solid #161616;
	}

	/* ── work ────────────────────────────────────────────────── */
	.work {
		position: relative;
		z-index: 1;
		max-width: 1280px;
		margin: 0 auto;
		padding: 6rem 2rem 8rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: #141414;
	}

	/* ── card ────────────────────────────────────────────────── */
	.card {
		background: #080808;
		padding: 2rem 1.8rem;
		border-left: 2px solid var(--c);
		transition: background 0.18s;
	}
	.card:hover { background: #0d0d0d; }
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 1rem;
	}
	.card-cat {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.22em;
		color: var(--c);
		text-transform: uppercase;
	}
	.card-year {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		color: #2a2a2a;
	}
	.card-title {
		font-family: Georgia, 'Times New Roman', Times, serif;
		font-size: 1.15rem;
		font-weight: 400;
		color: #c0bdb8;
		margin: 0 0 0.8rem;
		line-height: 1.3;
	}
	.card-blurb {
		font-size: 0.8rem;
		line-height: 1.75;
		color: #404040;
	}

	/* ── about ───────────────────────────────────────────────── */
	.about {
		position: relative;
		z-index: 1;
		max-width: 660px;
		margin: 0 auto;
		padding: 6rem 2rem 8rem;
	}
	.about-body p {
		font-size: 0.97rem;
		line-height: 1.9;
		color: #606060;
		margin-bottom: 1.6rem;
	}
	.about-body .lede {
		font-size: 1.08rem;
		color: #909090;
		line-height: 1.85;
	}

	/* ── footer ──────────────────────────────────────────────── */
	footer {
		position: relative;
		z-index: 1;
		padding: 1.8rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid #141414;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		color: #282828;
		text-transform: uppercase;
	}
	footer a {
		text-decoration: none;
		transition: color 0.2s;
	}
	footer a:hover { color: #888; }

	/* ── responsive ──────────────────────────────────────────── */
	@media (max-width: 960px) {
		.grid { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 600px) {
		.grid { grid-template-columns: 1fr; }
		h1 { font-size: 4rem; }
		.nav-links { gap: 1.5rem; }
		.coord { display: none; }
	}
</style>

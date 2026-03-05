<script>
	const projects = [
		{
			id: 'veritable-games',
			title: 'Veritable Games',
			tag: 'platform',
			year: '2024–',
			blurb:
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, quis nostrud exercitation ullamco laboris.'
		},
		{
			id: 'rstu-connect',
			title: 'RSTU Connect',
			tag: 'civic tech',
			year: '2024',
			blurb:
				'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit.'
		},
		{
			id: 'reno-dev-space',
			title: 'Reno Dev Space',
			tag: 'civic tech',
			year: '2023–',
			blurb:
				'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit.'
		}
	];

	const currently = [
		{ label: 'making', text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.' },
		{ label: 'reading', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
		{ label: 'thinking about', text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit ut labore.' }
	];
</script>

<svelte:head>
	<title>cwcorella</title>
	<meta name="description" content="Game designer, civic technologist, open source builder — Reno, NV." />
</svelte:head>

<div class="page">
	<div class="glow" aria-hidden="true"></div>
	<div class="glow glow--2" aria-hidden="true"></div>

	<nav>
		<a href="/" class="nav-home">cwcorella</a>
		<div class="nav-links">
			<a href="#work">work</a>
			<a href="#about">about</a>
		</div>
	</nav>

	<header class="hero">
		<div class="hero-inner">
			<p class="hi">hi.</p>
			<h1>cwcorella</h1>
			<p class="tagline">
				Lorem ipsum dolor sit amet — consectetur adipiscing elit, sed do eiusmod tempor
				incididunt ut labore. (reno, nv.)
			</p>
		</div>
	</header>

	<section class="intro">
		<p>
			Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
			ut labore et dolore magna aliqua. Ut enim ad minim veniam — quis nostrud exercitation
			ullamco laboris nisi ut aliquip. Duis aute irure dolor in reprehenderit in voluptate velit
			esse cillum.
		</p>
		<p>
			Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
			anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem
			accusantium doloremque laudantium — totam rem aperiam, eaque ipsa.
		</p>
	</section>

	<section id="work" class="work">
		<h2 class="label">things i've made</h2>
		<ul class="project-list">
			{#each projects as p}
				<li class="project">
					<div class="project-head">
						<span class="project-title">{p.title}</span>
						<span class="project-meta">{p.tag} · {p.year}</span>
					</div>
					<p class="project-blurb">{p.blurb}</p>
				</li>
			{/each}
		</ul>
	</section>

	<section class="currently">
		<h2 class="label">lately</h2>
		<ul class="currently-list">
			{#each currently as item}
				<li>
					<span class="currently-label">{item.label}</span>
					<span class="currently-text">{item.text}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section id="about" class="about">
		<h2 class="label">a few words</h2>
		<div class="about-body">
			<p class="lede">
				Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt
				ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
				ullamco laboris nisi — duis aute irure dolor in reprehenderit.
			</p>
			<p>
				Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque
				laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis. Nemo enim
				ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.
			</p>
			<p>
				At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium
				voluptatum deleniti atque corrupti. Nam libero tempore cum soluta nobis eligendi optio
				cumque nihil impedit quo minus id quod maxime placeat.
			</p>
		</div>
	</section>

	<footer>
		<span>cwcorella — {new Date().getFullYear()}</span>
		<a href="https://github.com/cwcorella-git" target="_blank" rel="noopener noreferrer">github ↗</a>
	</footer>
</div>

<style>
	/* ── reset ───────────────────────────────────────────────── */
	:global(*, *::before, *::after) { box-sizing: border-box; }
	:global(body, html) {
		margin: 0; padding: 0;
		background: #0c0902;
		color: #e2d8c4;
		font-family: Georgia, 'Times New Roman', Times, serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(a) { color: inherit; }

	/* ── page + warm grid texture ────────────────────────────── */
	.page {
		min-height: 100vh;
		position: relative;
		background-image:
			linear-gradient(rgba(212, 160, 80, 0.018) 1px, transparent 1px),
			linear-gradient(90deg, rgba(212, 160, 80, 0.018) 1px, transparent 1px);
		background-size: 48px 48px;
	}

	/* ── twin candlelight glows ──────────────────────────────── */
	.glow {
		position: fixed;
		border-radius: 50%;
		pointer-events: none;
		z-index: 0;
		top: 30%; left: 25%;
		width: 800px; height: 800px;
		transform: translate(-50%, -50%);
		background: radial-gradient(circle, rgba(210, 130, 40, 0.07) 0%, transparent 65%);
		animation: breathe 16s ease-in-out infinite;
	}
	.glow--2 {
		top: 75%; left: 72%;
		width: 500px; height: 500px;
		background: radial-gradient(circle, rgba(180, 100, 50, 0.05) 0%, transparent 65%);
		animation-delay: -7s;
	}
	@keyframes breathe {
		0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
		50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.18); }
	}

	/* ── nav ─────────────────────────────────────────────────── */
	nav {
		position: fixed;
		inset: 0 0 auto 0;
		z-index: 100;
		padding: 1.2rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgba(12, 9, 2, 0.85);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(212, 160, 80, 0.06);
	}
	.nav-home {
		font-size: 0.9rem;
		color: #6a5c3a;
		text-decoration: none;
		transition: color 0.2s;
	}
	.nav-home:hover { color: #c8a060; }
	.nav-links { display: flex; gap: 2rem; }
	.nav-links a {
		font-size: 0.85rem;
		color: #5a4e32;
		text-decoration: none;
		transition: color 0.2s;
	}
	.nav-links a:hover { color: #c8a060; }

	/* ── hero ────────────────────────────────────────────────── */
	.hero {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		display: flex;
		align-items: center;
		padding: 0 2rem;
	}
	.hero-inner {
		max-width: 820px;
		margin: 0 auto;
		width: 100%;
		padding-top: 5rem;
	}
	.hi {
		font-size: 1.4rem;
		color: #c8a060;
		margin: 0 0 0.6rem;
		font-style: italic;
	}
	h1 {
		font-size: clamp(3.5rem, 9vw, 8.5rem);
		font-weight: 400;
		line-height: 0.92;
		letter-spacing: -0.02em;
		color: #e2d8c4;
		margin: 0 0 2rem;
	}
	.tagline {
		font-size: 1.05rem;
		line-height: 1.7;
		color: #7a6a48;
		max-width: 520px;
		font-style: italic;
	}

	/* ── intro ───────────────────────────────────────────────── */
	.intro {
		position: relative;
		z-index: 1;
		max-width: 640px;
		margin: 0 auto;
		padding: 5rem 2rem 4rem;
	}
	.intro p {
		font-size: 1.05rem;
		line-height: 1.9;
		color: #9a8a68;
		margin-bottom: 1.4rem;
	}

	/* ── shared label ────────────────────────────────────────── */
	.label {
		font-size: 0.72rem;
		font-family: 'Courier New', Courier, monospace;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #4a3e26;
		font-weight: 400;
		margin: 0 0 2.5rem;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid rgba(212, 160, 80, 0.08);
	}

	/* ── work ────────────────────────────────────────────────── */
	.work {
		position: relative;
		z-index: 1;
		max-width: 720px;
		margin: 0 auto;
		padding: 5rem 2rem 4rem;
	}
	.project-list {
		list-style: none;
		margin: 0; padding: 0;
	}
	.project {
		padding: 2rem 0;
		border-bottom: 1px solid rgba(212, 160, 80, 0.07);
	}
	.project:first-child { border-top: 1px solid rgba(212, 160, 80, 0.07); }
	.project-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}
	.project-title {
		font-size: 1.2rem;
		color: #d4c4a0;
		letter-spacing: -0.01em;
	}
	.project-meta {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem;
		color: #4a3e26;
		letter-spacing: 0.08em;
	}
	.project-blurb {
		font-size: 0.9rem;
		line-height: 1.8;
		color: #6a5c3a;
		margin: 0;
	}

	/* ── currently ───────────────────────────────────────────── */
	.currently {
		position: relative;
		z-index: 1;
		max-width: 720px;
		margin: 0 auto;
		padding: 3rem 2rem 4rem;
	}
	.currently-list {
		list-style: none;
		margin: 0; padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.currently-list li {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 1rem;
		align-items: baseline;
	}
	.currently-label {
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		color: #c8a060;
		text-transform: uppercase;
	}
	.currently-text {
		font-size: 0.9rem;
		line-height: 1.6;
		color: #6a5c3a;
		font-style: italic;
	}

	/* ── about ───────────────────────────────────────────────── */
	.about {
		position: relative;
		z-index: 1;
		max-width: 640px;
		margin: 0 auto;
		padding: 4rem 2rem 7rem;
	}
	.about-body p {
		font-size: 0.97rem;
		line-height: 1.95;
		color: #6a5c3a;
		margin-bottom: 1.4rem;
	}
	.about-body .lede {
		font-size: 1.05rem;
		color: #9a8a68;
	}

	/* ── footer ──────────────────────────────────────────────── */
	footer {
		position: relative;
		z-index: 1;
		padding: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid rgba(212, 160, 80, 0.07);
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

	/* ── responsive ──────────────────────────────────────────── */
	@media (max-width: 600px) {
		h1 { font-size: 3.5rem; }
		.currently-list li { grid-template-columns: 1fr; gap: 0.25rem; }
		.project-head { flex-direction: column; }
	}
</style>

<script lang="ts">
	// The scene tuner (2026-10-23): every garden element on/off or scaled, the
	// adaptive text, and a clock to see any moment of any season. Admin only.
	// It stays open while the garden is clicked or the page is scrolled, so a
	// change can be judged against the scene; "hide page" clears the cards away.
	import { onMount } from 'svelte';
	import { adminState } from '$lib/admin/state.svelte';
	import { commitFiles } from '$lib/admin/github';
	import { toast } from '$lib/admin/toast.svelte';
	import { sceneTune, setScene, resetScene, sceneJson, scenePanel, SCENE_DEFAULTS, type SceneKey } from '$lib/admin/sceneTune.svelte';
	import { clock, sceneNow, setSceneTime, setSceneSpeed, setSceneWeather, goLive, atMinutes, atDayOfYear, presetMs, type Preset, type WeatherPick } from '$lib/garden/clock.svelte';
	import { dayOfYear, sunAltitudeDeg } from '$lib/garden/sun';
	import { moonPosition } from '$lib/garden/moon';

	type Row =
		| { key: SceneKey; label: string; kind: 'toggle' }
		| { key: SceneKey; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string };
	const t = (key: SceneKey, label: string): Row => ({ key, label, kind: 'toggle' });
	const r = (key: SceneKey, label: string, min: number, max: number, step: number, unit = '×'): Row => ({ key, label, kind: 'range', min, max, step, unit });

	const GROUPS: { name: string; rows: Row[] }[] = [
		{ name: 'sky', rows: [t('sun', 'sun'), t('glow', 'sun glow'), t('rays', 'sunbeams'), t('venus', 'twilight bands')] },
		{ name: 'clouds', rows: [
			t('cumulus', 'cumulus'), t('sheets', 'sheets'), t('cirrus', 'wisps'), t('cloudShadows', 'cloud shadows'), t('cloudGrow', 'clouds grow'),
			r('cloudAmount', 'amount', 0, 3, 0.1), r('cloudSize', 'size', 0.5, 2, 0.05), r('cloudOpacity', 'opacity', 0.3, 2, 0.05),
			r('cloudDetail', 'detail', 0.5, 2.5, 0.1), r('cloudEdge', 'edge lumps', 0, 2, 0.1),
		] },
		{ name: 'night', rows: [t('stars', 'stars'), t('milkyWay', 'milky way'), t('moon', 'moon'),
			r('starBright', 'star bright', 0.3, 2.5, 0.05), r('milkyWayAmt', 'milky way', 0, 2.5, 0.05), r('moonSize', 'moon size', 0.5, 3, 0.1), r('moonLight', 'moonlight', 0, 3, 0.1)] },
		{ name: 'land', rows: [
			t('mountains', 'mountains'), t('contours', 'contours'), t('meadow', 'meadow'), t('flowers', 'flowers'), t('rocks', 'rocks'), t('snow', 'snow'),
			t('trees', 'trees'), t('sage', 'sagebrush'), t('treeShadows', 'tree shadows'), t('grass', 'grass'), r('windAmt', 'wind', 0, 3, 0.1),
		] },
		{ name: 'text', rows: [
			r('contrast', 'contrast', 4.5, 7, 0.1, ':1'), r('glassDay', 'glass day', 0, 0.8, 0.01, ''), r('glassNight', 'glass night', 0, 0.9, 0.01, ''),
			r('textScale', 'size', 0.8, 1.4, 0.02), r('textWeight', 'weight', 300, 700, 50, ''), r('textHalo', 'halo', 0, 1, 0.05, ''),
		] },
		{ name: 'effects', rows: [t('grain', 'grain'), t('vignette', 'vignette'), r('grainAmt', 'grain', 0, 2, 0.05), r('vignetteAmt', 'vignette', 0, 2.5, 0.05),
			r('dayFps', 'day fps', 1, 30, 1, ''), r('nightFps', 'night fps', 2, 60, 1, '')] },
	];

	let open = $state<Record<string, boolean>>({ time: true });

	// ── clock readout, refreshed twice a second while the clock runs ─────────
	let now = $state(sceneNow());
	onMount(() => {
		const id = setInterval(() => { now = sceneNow(); }, 500);
		return () => clearInterval(id);
	});
	$effect(() => { void clock.version; now = sceneNow(); });

	const minutes = $derived(now.getHours() * 60 + now.getMinutes());
	const doy = $derived(dayOfYear(now));
	const alt = $derived(sunAltitudeDeg(now));
	const moon = $derived(moonPosition(now));
	const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

	const PRESETS: [Preset, string][] = [
		['dawn', 'dawn'], ['morning', 'morning'], ['noon', 'noon'], ['golden', 'golden'], ['sunset', 'sunset'],
		['blue', 'blue hour'], ['night', 'night'], ['fullMoon', 'full moon'], ['newMoon', 'new moon'], ['snow', 'snow day'],
	];
	function preset(p: Preset) {
		setSceneTime(presetMs(p, now));
		if (p === 'snow') setSceneWeather('snow');
		else if (clock.weather === 'snow') setSceneWeather('auto');
		if (clock.speed !== 1) setSceneSpeed(1);
	}
	const SPEEDS: [number, string][] = [[0, '❚❚'], [1, '1×'], [60, '60×'], [600, '600×'], [3600, '1h/s']];
	const WEATHERS: WeatherPick[] = ['auto', 'clear', 'fair', 'busy', 'overcast', 'snow'];

	// ── save for everyone ─────────────────────────────────────────────────────
	let publishing = $state(false);
	async function publish() {
		if (!adminState.pat) { toast.error('No PAT loaded — cannot commit.'); return; }
		publishing = true;
		try {
			await commitFiles(adminState.pat, [{ path: 'static/scene.json', content: sceneJson() }], 'chore(scene): site-wide scene settings');
			toast.success('Scene saved for everyone — live after the next deploy.');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			publishing = false;
		}
	}

	const changed = (k: SceneKey) => sceneTune[k] !== SCENE_DEFAULTS[k];
	const fmt = (v: number, unit = '') => `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')}${unit}`;

	function togglePeek() {
		scenePanel.peek = !scenePanel.peek;
		document.documentElement.classList.toggle('scene-peek', scenePanel.peek);
	}
	function close() {
		scenePanel.open = false;
		if (scenePanel.peek) togglePeek();
	}
</script>

<aside class="scene" aria-label="Scene tuner">
	<header>
		<p class="title">scene</p>
		<button class="chip" class:on={scenePanel.peek} onclick={togglePeek}>{scenePanel.peek ? 'show page' : 'hide page'}</button>
		<button class="chip" onclick={close} aria-label="Close scene tuner">×</button>
	</header>

	<section>
		<button class="group" onclick={() => (open.time = !open.time)} aria-expanded={!!open.time}>
			time {clock.sim ? '· simulated' : '· live'}
		</button>
		{#if open.time}
			<p class="readout">
				{now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {fmtTime(minutes)}
				· sun {alt.toFixed(1)}° · moon {moon.alt.toFixed(0)}° {Math.round((1 - Math.abs(moon.phase - 0.5) * 2) * 100)}%
			</p>
			<label class="row">
				<span>time</span>
				<input type="range" min="0" max="1439" step="5" value={minutes} oninput={(e) => setSceneTime(atMinutes(now, +e.currentTarget.value))} />
				<span class="val">{fmtTime(minutes)}</span>
			</label>
			<label class="row">
				<span>day</span>
				<input type="range" min="1" max="365" step="1" value={doy} oninput={(e) => setSceneTime(atDayOfYear(now, +e.currentTarget.value))} />
				<span class="val">{doy}</span>
			</label>
			<div class="chips">
				{#each PRESETS as [p, label] (p)}<button class="chip" onclick={() => preset(p)}>{label}</button>{/each}
			</div>
			<div class="chips">
				{#each SPEEDS as [s, label] (s)}
					<button class="chip" class:on={clock.sim && clock.speed === s} onclick={() => setSceneSpeed(s)}>{label}</button>
				{/each}
				<button class="chip" class:on={!clock.sim} onclick={goLive}>live</button>
			</div>
			<div class="chips">
				{#each WEATHERS as w (w)}
					<button class="chip" class:on={clock.weather === w} onclick={() => setSceneWeather(w)}>{w}</button>
				{/each}
			</div>
		{/if}
	</section>

	{#each GROUPS as g (g.name)}
		<section>
			<button class="group" onclick={() => (open[g.name] = !open[g.name])} aria-expanded={!!open[g.name]}>
				{g.name}{g.rows.some((row) => changed(row.key)) ? ' ·' : ''}
			</button>
			{#if open[g.name]}
				{#each g.rows as row (row.key + row.kind)}
					{#if row.kind === 'toggle'}
						<label class="row toggle" class:changed={changed(row.key)}>
							<span>{row.label}</span>
							<input type="checkbox" checked={!!sceneTune[row.key]} onchange={(e) => setScene({ [row.key]: e.currentTarget.checked })} />
						</label>
					{:else}
						<label class="row" class:changed={changed(row.key)}>
							<span>{row.label}</span>
							<input type="range" min={row.min} max={row.max} step={row.step} value={sceneTune[row.key] as number}
								oninput={(e) => setScene({ [row.key]: +e.currentTarget.value })}
								ondblclick={() => setScene({ [row.key]: SCENE_DEFAULTS[row.key] })} />
							<span class="val">{fmt(sceneTune[row.key] as number, row.unit)}</span>
						</label>
					{/if}
				{/each}
			{/if}
		</section>
	{/each}

	<footer>
		<span class="hint">double-click a slider to reset it</span>
		<button class="chip" onclick={resetScene} title="back to the site's values">reset</button>
		<button class="chip" onclick={publish} disabled={publishing}>{publishing ? 'saving…' : 'save for everyone'}</button>
	</footer>
</aside>

<style>
	.scene {
		position: fixed;
		top: 67px;
		right: 16px;
		z-index: 120;
		width: min(300px, calc(100vw - 32px));
		max-height: calc(100vh - 83px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--glass-bg-dark);
		border: 1px solid var(--glass-border-dark);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		padding: 11px 13px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-family: var(--font-ui);
		color: var(--clr-dark-text);
		/* the panel's own type stays fixed while the text sliders change the page */
		font-size: 13px;
		font-weight: 400;
		text-shadow: none;
	}
	@media (max-width: 520px) {
		.scene { left: 16px; right: 16px; width: auto; top: auto; bottom: 16px; max-height: 55vh; }
	}
	header, footer { display: flex; align-items: center; gap: 6px; }
	.title { margin: 0 auto 0 0; font-size: 0.7em; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.6; }
	footer { justify-content: flex-end; flex-wrap: wrap; }
	.hint { margin-right: auto; font-size: 0.62em; opacity: 0.45; }
	section { display: flex; flex-direction: column; gap: 5px; }
	.group {
		background: none; border: none; padding: 4px 0; text-align: left; cursor: pointer;
		color: inherit; font: inherit; font-size: 0.68em; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.65;
		border-top: 1px solid rgba(var(--dark-panel-rgb), 0.12);
	}
	.readout { margin: 0; font-size: 0.72em; opacity: 0.75; font-variant-numeric: tabular-nums; }
	.row {
		display: grid; grid-template-columns: 7.5em 1fr 3.8em; align-items: center; gap: 6px;
		font-size: 0.75em;
	}
	.row.toggle { grid-template-columns: 1fr auto; }
	.row.changed span:first-child { font-weight: 600; }
	.row input[type='range'] { width: 100%; min-width: 0; accent-color: rgb(var(--dark-panel-rgb)); }
	.val { text-align: right; opacity: 0.7; font-variant-numeric: tabular-nums; }
	.chips { display: flex; flex-wrap: wrap; gap: 4px; }
	.chip {
		background: none; border: 1px solid rgba(var(--dark-panel-rgb), 0.22); color: inherit;
		font: inherit; font-size: 0.66em; padding: 3px 8px; cursor: pointer;
	}
	.chip.on { background: rgba(var(--dark-panel-rgb), 0.18); border-color: rgba(var(--dark-panel-rgb), 0.5); }
	.chip:disabled { opacity: 0.5; cursor: default; }
	:global(html.scene-peek .page-content) { visibility: hidden; }
</style>

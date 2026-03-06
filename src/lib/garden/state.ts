// Garden persistence — age units, growth curve, localStorage state

const GARDEN_KEY  = 'cwc:garden-v1';
const INITIAL_AGE = 11315;   // ~31 years of pre-seeded growth

export interface GardenState {
	version:         number;
	seed:            number;   // master RNG seed (fixed at first init, never changes)
	ageUnits:        number;   // total accumulated notional days of growth
	lastVisit:       number;   // Date.now() ms — for day-elapsed accrual
	lastVisitAgeAdd: number;   // Date.now() ms — last time a visit was credited
}

function defaultState(): GardenState {
	return {
		version:         1,
		seed:            (Math.random() * 0x7FFFFFFF) | 0,
		ageUnits:        INITIAL_AGE,
		lastVisit:       Date.now(),
		lastVisitAgeAdd: 0,
	};
}

export function loadGardenState(): GardenState {
	try {
		const raw = localStorage.getItem(GARDEN_KEY);
		if (raw) {
			const s = JSON.parse(raw) as GardenState;
			if (s.version === 1) return s;
		}
	} catch { /* localStorage unavailable */ }
	const s = defaultState();
	saveGardenState(s);
	return s;
}

export function saveGardenState(state: GardenState): void {
	try { localStorage.setItem(GARDEN_KEY, JSON.stringify(state)); } catch {}
}

// Fire-and-forget — reads, increments, and writes without needing the full state object.
// Safe to call from any context (journal saves, book edits, etc.).
export function addAgeUnits(delta: number): void {
	try {
		const raw = localStorage.getItem(GARDEN_KEY);
		if (!raw) return;
		const s = JSON.parse(raw) as GardenState;
		s.ageUnits = Math.max(0, s.ageUnits + delta);
		saveGardenState(s);
	} catch {}
}

// Credit +3 age units for a page visit, at most once per hour.
export function creditVisit(state: GardenState): GardenState {
	const now = Date.now();
	if (now - state.lastVisitAgeAdd >= 3_600_000) {
		state.ageUnits      += 3;
		state.lastVisitAgeAdd = now;
	}
	state.lastVisit = now;
	return state;
}

// Credit +1 age unit per real calendar day elapsed since last visit.
// Captures time the user is away — the garden keeps growing slowly.
export function accrueElapsedDays(state: GardenState): GardenState {
	const days = Math.floor((Date.now() - state.lastVisit) / 86_400_000);
	if (days > 0) state.ageUnits += days;
	return state;
}

// Logistic growth curve: age units since plant birth → 0..1 scale factor.
//   age    0 → ~0.27  (seedling)
//   age  500 → ~0.50  (mid-growth)
//   age 5000 → ~0.98  (mature)
//   age 11315 → ~0.99 (old-growth)
export function growthFactor(ageSinceBirth: number): number {
	return 1 / (1 + Math.exp(-0.0008 * (ageSinceBirth - 500)));
}

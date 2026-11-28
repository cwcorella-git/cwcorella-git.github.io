// When a stored thought drifts back into view. Pure, so it can be tested.
//
// Model: a Poisson process (memoryless arrivals) whose rate saturates with the
// number of thoughts stored, n:
//
//     lambda(n) = LAMBDA_MAX * n / (n + K)        (Michaelis-Menten / Hill, order 1)
//
// Zero thoughts: never. A few: hours apart. Many: approaches, and never passes,
// one per 1/LAMBDA_MAX seconds. That cap is the "limited window": writing more
// makes it likelier, with diminishing returns, up to a ceiling.

/** Ceiling: one appearance per 20 minutes of the page being open. */
export const LAMBDA_MAX = 1 / (20 * 60);
/** Half-saturation: at K thoughts the rate is half the ceiling. */
export const K = 25;

/** Appearances per second of open page, given n stored thoughts. */
export function rate(n: number): number {
	if (!(n > 0)) return 0;
	return (LAMBDA_MAX * n) / (n + K);
}

/** Probability that at least one appearance happens within dt seconds. */
export function chanceWithin(n: number, dtSec: number): number {
	return 1 - Math.exp(-rate(n) * dtSec);
}

/** A random index, never `last` when there is another to choose. -1 if empty. */
export function pickIndex(count: number, rng: () => number, last = -1): number {
	if (count <= 0) return -1;
	if (count === 1) return 0;
	let i = Math.floor(rng() * (count - 1));
	if (last >= 0 && i >= last) i++;
	return Math.min(i, count - 1);
}

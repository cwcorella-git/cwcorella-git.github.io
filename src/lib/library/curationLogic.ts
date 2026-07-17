import type { Decision, DecisionInput, CurationStats } from './types';

/** Reader toggle: clicking the active decision clears it (undecided). */
export function toggleDecision(current: Decision | null, clicked: Decision): DecisionInput {
	return current === clicked ? 'undecided' : clicked;
}

/** Row badge text; '' when undecided (caller renders nothing). */
export function badgeLabel(decision: Decision | null): string {
	return decision ?? '';
}

/** Clamp an index into a known list; null when the list size is unknown/empty. */
export function clampIndex(index: number, total: number | null): number | null {
	if (total === null || total <= 0) return null;
	return Math.max(0, Math.min(index, total - 1));
}

/** Progress readout for the controls bar. */
export function progressText(stats: CurationStats | null): string {
	if (!stats) return '';
	return `${stats.decided.toLocaleString()} / ${stats.total.toLocaleString()} decided`;
}

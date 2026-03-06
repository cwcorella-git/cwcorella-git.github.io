export async function generateJournalSlug(
	content: string,
	existingSlugs: string[]
): Promise<string> {
	const { default: nlp } = await import('compromise');

	// Strip markdown syntax before NLP
	const plain = content
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_`~\[\]()>]/g, '')
		.replace(/https?:\S+/g, '');

	const doc = nlp(plain);
	const nouns: string[] = doc.nouns().out('array');

	// Frequency-rank and pick top 3
	const freq: Record<string, number> = {};
	for (const w of nouns) {
		const key = w.toLowerCase().replace(/[^a-z]/g, '');
		if (key.length >= 3) freq[key] = (freq[key] ?? 0) + 1;
	}
	const top = Object.entries(freq)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([w]) => w);

	// Fallback: if fewer than 2 words, pad with random hex
	while (top.length < 2) {
		top.push(Math.random().toString(16).slice(2, 6));
	}

	const base = top.join('-');

	// Collision check
	if (!existingSlugs.includes(base)) return base;
	let n = 2;
	while (existingSlugs.includes(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

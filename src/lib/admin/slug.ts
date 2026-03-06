const STOPWORDS = new Set([
	'the', 'this', 'that', 'these', 'those',
	'they', 'them', 'their', 'theirs',
	'you', 'your', 'yours',
	'our', 'ours', 'we', 'us',
	'its', 'his', 'her', 'hers',
	'and', 'but', 'for', 'not', 'nor', 'yet', 'with', 'also',
	'has', 'have', 'had', 'having',
	'can', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
	'are', 'was', 'were', 'been', 'being',
	'all', 'any', 'each', 'both', 'few', 'more', 'most', 'other', 'some',
	'than', 'too', 'very', 'just', 'one', 'two', 'new', 'own',
	// Zim wiki / metadata terms
	'content', 'type', 'wiki', 'format', 'creation', 'modified', 'notebook', 'zim',
]);

const VOWELS = /[aeiou]/;

function preprocess(text: string): string {
	return text
		// Strip Zim wiki metadata headers (Content-Type: ..., Wiki-Format: ..., etc.)
		.replace(/^[\w-]+:\s*\S[^\n]*/gm, (line) =>
			/^(content-type|wiki-format|creation-date|modified|tags|notebook)/i.test(line) ? '' : line
		)
		.replace(/^#{1,6}\s+/gm, '')
		// Replace word-splitting punctuation with spaces so "text/x-zim-wiki" → "text x zim wiki"
		.replace(/[/\-_:]/g, ' ')
		.replace(/[*`~[\]()>]/g, '')
		.replace(/https?:\S+/g, '');
}

function buildFreqMap(nouns: string[]): Record<string, number> {
	const freq: Record<string, number> = {};
	for (const phrase of nouns) {
		for (const word of phrase.split(/\s+/)) {
			const key = word.toLowerCase().replace(/[^a-z]/g, '');
			if (
				key.length >= 3 &&
				key.length <= 14 &&
				!STOPWORDS.has(key) &&
				VOWELS.test(key)
			) {
				freq[key] = (freq[key] ?? 0) + 1;
			}
		}
	}
	return freq;
}

function pickSlug(freq: Record<string, number>, existingSlugs: string[]): string {
	const ranked = Object.entries(freq)
		.sort((a, b) => b[1] - a[1])
		.map(([w]) => w);

	const pool = ranked.slice(0, 6);
	while (pool.length < 2) {
		pool.push(Math.random().toString(16).slice(2, 6));
	}

	const top = pool.slice(0, Math.min(3, pool.length));
	const base = top.join('-');

	if (!existingSlugs.includes(base)) return base;

	for (let i = top.length; i < pool.length; i++) {
		const alt = [...top.slice(0, -1), pool[i]].join('-');
		if (!existingSlugs.includes(alt)) return alt;
	}

	let n = 2;
	while (existingSlugs.includes(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

export async function generateJournalSlug(
	content: string,
	existingSlugs: string[]
): Promise<string> {
	const { default: nlp } = await import('compromise');
	const doc = nlp(preprocess(content));
	const nouns: string[] = doc.nouns().out('array');
	const freq = buildFreqMap(nouns);
	return pickSlug(freq, existingSlugs);
}

const STOPWORDS = new Set([
	// Pronouns
	'the', 'this', 'that', 'these', 'those',
	'they', 'them', 'their', 'theirs',
	'you', 'your', 'yours',
	'our', 'ours', 'we', 'us',
	'its', 'his', 'her', 'hers',
	'she', 'him', 'who', 'whom',
	// Conjunctions / prepositions
	'and', 'but', 'for', 'not', 'nor', 'yet', 'with', 'also', 'into', 'onto',
	'about', 'above', 'after', 'before', 'between', 'during', 'from', 'over',
	'under', 'upon', 'without',
	// Auxiliaries / modals
	'has', 'have', 'had', 'having',
	'can', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
	'are', 'was', 'were', 'been', 'being',
	// Determiners / quantifiers
	'all', 'any', 'each', 'both', 'few', 'more', 'most', 'other', 'some',
	'than', 'too', 'very', 'just', 'one', 'two', 'new', 'own',
	// Contractions with apostrophe stripped
	'weve', 'ive', 'youre', 'theyre', 'shes', 'hes', 'dont', 'wont',
	'cant', 'ill', 'didnt', 'isnt', 'wouldnt', 'couldnt', 'shouldnt',
	'havent', 'hasnt', 'wasnt', 'werent', 'thats', 'whats', 'theres',
	// Vague / generic nouns
	'thing', 'things', 'something', 'anything', 'everything', 'nothing',
	'someone', 'anyone', 'everyone',
	'way', 'ways', 'kind', 'sort', 'part', 'parts', 'bit', 'bits',
	'lot', 'lots', 'bunch', 'piece', 'pieces',
	// Vague location / directional
	'here', 'there', 'where', 'place', 'point',
	// Question words
	'how', 'what', 'when', 'why', 'which',
	// Common weak verbs that slip through NLP
	'said', 'says', 'say', 'got', 'get', 'gets', 'make', 'makes', 'made',
	'take', 'takes', 'took', 'come', 'comes', 'came', 'look', 'looks',
	'know', 'knew', 'think', 'thought', 'want', 'wants', 'need', 'needs',
	'going', 'goes', 'went', 'see', 'seen', 'saw', 'felt', 'feel', 'feels',
	// Informal / junk tokens
	'unk', 'amp', 'wut', 'rando', 'lol', 'lmao', 'etc', 'aka',
	// Known usernames in chat logs (Discord handles)
	'amglitch', 'pmglitch', 'pmchris', 'daveshap', 'guillaume',
	// Zim wiki / metadata terms
	'content', 'type', 'wiki', 'format', 'creation', 'modified', 'notebook', 'zim',
]);

// Valid English two-consonant word onsets — words starting with other
// two-consonant combos (e.g. "pm", "gm") are likely usernames or junk
const VALID_2_ONSET = new Set([
	'bl','br','cl','cr','dr','dw','fl','fr','gl','gr','kl','kr','kn',
	'pl','pr','sc','sf','sk','sl','sm','sn','sp','sq','st','sw','tr',
	'tw','wr','ch','sh','th','wh','ph','gn','mn',
]);
const VOWEL_SET = new Set('aeiou');

function hasValidOnset(word: string): boolean {
	if (VOWEL_SET.has(word[0])) return true;           // starts with vowel — fine
	if (!word[1] || VOWEL_SET.has(word[1])) return true; // consonant + vowel — fine
	return VALID_2_ONSET.has(word[0] + word[1]);          // consonant pair must be valid
}

function preprocess(text: string): string {
	return text
		// Strip Zim wiki metadata headers
		.replace(/^[\w-]+:\s*\S[^\n]*/gm, (line) =>
			/^(content-type|wiki-format|creation-date|modified|tags|notebook)/i.test(line) ? '' : line
		)
		// Strip bare URLs and domains
		.replace(/https?:\S+/g, '')
		.replace(/\bwww\.\S+/g, '')
		.replace(/\b\w+\.(com|org|net|io|gov|edu|tv|co)\b/gi, '')
		// Strip filename-with-extension tokens
		.replace(/\b\w+\.(docx?|txt|text|pdf|md|png|jpe?g|gif)\b/gi, '')
		.replace(/^#{1,6}\s+/gm, '')
		// Replace word-splitting punctuation with spaces
		.replace(/[/\-_:]/g, ' ')
		.replace(/[*`~[\]()>]/g, '');
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
				/[aeiou]/.test(key) &&
				hasValidOnset(key)
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

# books.json <-> library corpus: what is still unresolved

Generated 2026-09-24 from `scripts/match-library.mjs` (the matcher that already
ships, not a new one) against `/data/library-api/library.db` on the workstation.
**Report only. Nothing in `books.json` was changed to produce this.**

Where things stand: 902 books, **266 matched** to a corpus document, 128 currently
carry a `doc`. Regenerated 2026-09-24 after four fixes to the matcher -- youtube
transcripts and reviews are no longer treated as book texts, the author column
ranks candidates instead of gating them, and a tie now takes the longer body,
which moved *An Anarchist FAQ* from a 1,689-word stub to the full 1,830,310.

| | rows | what it is |
|---|--:|---|
| carrying a doc already | 128 | done |
| licence needs review | 84 | **section 1 -- your call** |
| held by the 40k-word gate | 49 | section 2 -- deliberate |
| match quality below `exact` | 38 | section 3 -- check before trusting |

---

## 1. Licence needs review (93 rows, and only 23 still need a per-text call)

These matched a document whose `license` column is NULL. NULL means *deny until
cleared*, never "no licence needed" -- so the export refuses them.

**Re-cut 2026-09-24 after the matcher fixes and four batch rulings.** The flat
list of 84 was misleading in three separate ways, and the groups below are what
is left once each is accounted for.

| group | rows | status |
|---|--:|---|
| Over the 40,000-word export gate | 43 | **Moot.** Blocked whatever the licence says. |
| Stubs under 1,000 words | 9 | **Not a licence call.** A matcher defect. |
| Bookchin | 5 | **Denied** 2026-09-24. |
| Princeton "Ancient Guide" series | 7 | **Denied** 2026-09-24. |
| Pre-1930 and movement classics | 6 | **Cleared** 2026-09-24, pending the DB write. |
| Genuinely individual | 23 | **Open.** Your call, one at a time. |

**There is nothing automatic left in any of it.** All of these are `user`-sourced,
and `SOURCE_LICENSE` declares no licence for that source. The two sources that do
carry one, `anarchist` and `marxist`, are fully backfilled with zero NULLs, so
`backfill_license.py` would set nothing.

### 1a. Over the word gate -- moot (43)

`export-library-docs.mjs` refuses anything over 40,000 words regardless of
licence, because the corpus licence is least reliable for book-length works.
Clearing any of these changes nothing. They are listed so they are not reviewed
again by mistake.

<details><summary>43 rows</summary>

| book | words | tier | doc |
|---|--:|---|---|
| The Slave's Cause: A History of Abolition | 354,555 | weak | `user/the-slaves-cause-the-slaves-cause-a-history-of-abolition-manisha-sinha-liber3-13180.md` |
| The Making of the English Working Class | 342,295 | exact | `user/the-making-of-the-english-working-class-14287.md` |
| Debt The First 5,000 Years | 227,915 | weak | `user/debt-the-first-5000-years-15780.md` |
| Possibilities: Essays on Hierarchy, Rebellion, and Desire | 191,205 | exact | `user/possibilities-essays-on-hierarchy-rebellion-and-desire-14644.md` |
| Centuries of Childhood: A Social History of Family Life | 184,968 | strong | `user/centuries-of-childhood-a-social-history-of-family-life-centuries-of-15087.md` |
| Permaculture: Principles and Pathways beyond Sustainability | 165,458 | exact | `user/permaculture-principles-and-pathways-beyond-sustainability-13825.md` |
| Gaia's Garden: A Guide to Home-Scale Permaculture | 157,426 | weak | `user/gaias-garden-second-edition-a-guide-to-home-scale-permaculture---gaias-garden-second-edition-a-guide-to-home-scale-permaculture-13690.md` |
| What is Property | 155,988 | exact | `user/what-is-property-15256.md` |
| The Ego and Its Own | 149,120 | exact | `user/the-ego-and-its-own-max-stirner-cambridge-texts-in--annas-archive-14173.md` |
| Crises of Global Economy and the Future of Capitalism: An Insight into the Marx's Crisis Theory | 142,219 | weak | `user/crises-of-global-economy-and-the-future-of-capitalism-an-insight-into-the-marx-16545.md` |
| Bakunin on Anarchy | 142,195 | exact | `user/bakunin-on-anarchy-13770.md` |
| If This Is a Man: The Truce | 142,003 | weak | `user/if-this-is-a-man-the-truce-abacus-40th-an-13243.md` |
| EcoCities: Rebuilding Cities in Balance with Nature | 139,100 | exact | `user/ecocities-rebuilding-cities-in-balance-with-nature-14583.md` |
| How Europe Underdeveloped Africa | 136,477 | exact | `user/how-europe-underdeveloped-africa-12824.md` |
| The Buddha & His Teachings | 134,161 | exact | `user/the-buddha-his-teachings-13278.md` |
| Abundance: The Future Is Better Than You Think | 112,558 | strong | `user/abundance-abundance-the-future-is-better-than-you-think-14799.md` |
| The Wretched of the Earth | 101,722 | weak | `user/the-wretched-of-the-earth-the-wretched-of-the-earth-14254.md` |
| Workers' Councils | 101,248 | weak | `user/workers-councils-1947-16110.md` |
| Defund The Police: An International Insurrection | 95,750 | strong | `user/defund-the-police-an-international-insurrection-defund-the-police-an-internati-12718.md` |
| What Is Communist Anarchism | 94,127 | exact | `user/what-is-communist-anarchism-13879.md` |
| Red Skin, White Masks: Rejecting the Colonial Politics of Recognition | 91,061 | weak | `user/red-skin-white-masks-rejecting-the-colon-glen-13116.md` |
| A World Without Police | 91,009 | exact | `user/a-world-without-police-14230.md` |
| How We Fight White Supremacy | 90,503 | exact | `user/how-we-fight-white-supremacy-12298.md` |
| The Life of Milarepa | 87,580 | exact | `user/the-life-of-milarepa-12416.md` |
| A Brief History of Neoliberalism | 85,970 | exact | `user/a-brief-history-of-neoliberalism-16062.md` |
| Law and the Utopian Imagination | 76,773 | exact | `user/law-and-the-utopian-imagination-13111.md` |
| How to Create Your Own Luck: The "You Never Know" Approach to Networking, Taking Chances, and Opening Yourself to Opportunity | 68,913 | exact | `user/how-to-create-your-own-luck-the-you-never-know-approach-to-networking-taking-chances-and-opening-yourself-to-opportunity-13142.md` |
| Sister Outsider: Essays and Speeches | 68,897 | weak | `user/sister-outsider-essays-and-speeches-cros-lorde-audre-lorde-audre-12376.md` |
| So You Want to Talk About Race | 68,250 | exact | `user/so-you-want-to-talk-about-race-12857.md` |
| How to Work a Room: Your Essential Guide to Savvy Socializing | 67,625 | exact | `user/how-to-work-a-room-your-essential-guide-to-savvy-socializing-12562.md` |
| Global Capitalism and the Crisis of Humanity | 66,385 | exact | `user/global-capitalism-and-the-crisis-of-humanity-15107.md` |
| Teaching to Transgress: Education As The Practice of Freedom | 64,668 | exact | `user/teaching-to-transgress-education-as-the-practice-of-freedom-13852.md` |
| In Defense of Housing: The Politics of Crisis | 62,186 | strong | `user/in-defense-of-housing-the-politics-of-cri-12707.md` |
| Right-Wing Collectivism: The Other Threat | 57,540 | exact | `user/right-wing-collectivism-the-other-threat-15527.md` |
| Permaculture Design: A Step by Step Guide | 56,264 | strong | `user/permaculture-design-a-step-by-step-guide---permaculture-design-12509.md` |
| How to Talk With Practically Anybody About Practically Anything | 55,952 | exact | `user/how-to-talk-with-practically-anybody-about-practically-anything-13339.md` |
| Blackshirts and Reds: Rational Fascism and the Overthrow of Communism | 55,674 | exact | `user/blackshirts-and-reds-rational-fascism-and-the-overthrow-of-communism-15514.md` |
| The End of Arrogance: America in the Global Competition of Ideas | 54,030 | exact | `user/the-end-of-arrogance-america-in-the-global-competition-of-ideas-16358.md` |
| How to Win an Argument: An Ancient Guide to the Art of Persuasion | 51,926 | exact | `user/how-to-win-an-argument-an-ancient-guide-to-the-art-of-persuasion-14708.md` |
| Anarchism, Marxism and the Future of the Left: Interviews and Essays, 1993-1998 | 47,929 | strong | `user/anarchism-marxism-and-the-future-of-the-left-interviews-and-essays-1993-1998-mu-12623.md` |
| Against Borders: The Case for Abolition | 46,405 | weak | `user/against-borders-the-case-for-abolition-gracie-13330.md` |
| T.A.Z.: The Temporary Autonomous Zone, Ontological Anarchy, Poetic Terrorism | 42,906 | strong | `user/taz-the-temporary-autonomous-zone-ontological-anarchy-poetic-terrorism-13848.md` |
| Imagination: A Very Short Introduction | 40,306 | exact | `user/imagination-a-very-short-introduction-13803.md` |

</details>

### 1b. Stubs -- a matcher defect, not a licence question (9)

Each of these is bound to a fragment, not a text. Clearing one would publish a
husk under the book's name, which is worse than publishing nothing. Six have a
full copy of the same work elsewhere in the corpus -- *Urbanization Without
Cities* at 114,288 words against the 130 it matched, *The Third Revolution* at
315,987 against 106, *Pedagogy of the Oppressed* at 59,048 against 283 -- and
all six full copies are themselves over the word gate, so re-matching moves them
into 1a rather than publishing them.

The mechanism is recorded in `design/docs/sourcing/archive/IMAGEONLY_RESOURCING_CHECKLIST.md`:
these titles were re-sourced from theanarchistlibrary.org into the unconverted
pile, so both artifacts exist -- the old image-scan husk and the new full text --
and the matcher bound the husk. Any `[x]` row on that checklist is a candidate
for the same double.

| book | words | tier | doc |
|---|--:|---|---|
| The Myth of Non-Reformist Reforms | 853 | exact | `user/the-myth-of-non-reformist-reforms-15664.md` |
| Pedagogy of the Oppressed | 283 | exact | `user/pedagogy-of-the-oppressed-13001.md` |
| Urbanization Without Cities: The Rise and Decline of Citizenship | 130 | weak | `user/planning-article-urbanization-without-cities-the-rise-and-decline-of-citizenship-14627.md` |
| The Ecology of Freedom: The Emergence and Dissolution of Hierarchy | 125 | exact | `user/the-ecology-of-freedom-the-emergence-and-dissolution-of-hierarchy-14212.md` |
| Education for Critical Consciousness | 115 | exact | `user/education-for-critical-conssciousness-15021.md` |
| The Third Revolution: Popular Movements in the Revolutionary Era Volume 2 | 106 | strong | `user/the-third-revolution-popular-movements-in-the-revolutionary-era-12607.md` |
| The Third Revolution: Popular Movements in the Revolutionary Era, Volume 1 | 106 | strong | `user/the-third-revolution-popular-movements-in-the-revolutionary-era-12607.md` |
| The Philosophy of Social Ecology: Essays on Dialectical Naturalism | 64 | exact | `user/the-philosophy-of-social-ecology-essays-on-dialectical-naturalism-13915.md` |
| Iron John: A Book About Men | 34 | weak | `user/iron-john-a-book-about-12427.md` |

### 1c. Bookchin -- DENIED 2026-09-24 (5)

AK Press keeps most of this in print. This is the same ground on which *The
Ecology of Freedom* was quarantined during sourcing, so the ruling is consistent
with a judgement already made. No write is needed: NULL already denies.

| book | words | tier | doc |
|---|--:|---|---|
| Whither Anarchism? | 36,729 | exact | `user/whither-anarchism-13553.md` |
| Social Ecology and Communalism | 31,318 | exact | `user/social-ecology-and-communalism-14992.md` |
| Social Anarchism or Lifestyle Anarchism: An Unbridgeable Chasm | 30,218 | weak | `user/social-anarchism-or-lifestyle-anarchism-an-unbridgeable-chasm-murray-bookchin-l-12489.md` |
| What is Social Ecology | 9,099 | exact | `user/what-is-social-ecology-13241.md` |
| Free Cities: Communalism and the Left | 1,890 | exact | `user/free-cities-communalism-and-the-left-12331.md` |

### 1d. Princeton "Ancient Guide" series -- DENIED 2026-09-24 (7)

One publisher, one series, all in-copyright modern translations of ancient texts.
The ancient text is free; Princeton's translation is not, and the translation is
what we hold. No write is needed.

| book | words | tier | doc |
|---|--:|---|---|
| How to Die: An Ancient Guide to the End of Life | 37,348 | weak | `user/how-to-die-an-ancient-guide-to-the-end-of-12411.md` |
| How to Keep Your Cool: An Ancient Guide to Anger Management | 28,005 | exact | `user/how-to-keep-your-cool-an-ancient-guide-to-anger-management-12248.md` |
| How to Be a Friend: An Ancient Guide to True Friendship | 26,500 | exact | `user/how-to-be-a-friend-an-ancient-guide-to-true-friendship-13046.md` |
| How to Run a Country: An Ancient Guide for Modern Leaders | 24,916 | weak | `user/how-to-run-a-country-an-ancient-guide-for-marcus-13813.md` |
| How to Grow Old: Ancient Wisdom for the Second Half of Life | 24,877 | exact | `user/how-to-grow-old-ancient-wisdom-for-the-second-half-of-life-12147.md` |
| How to Have a Life: An Ancient Guide to Using Our Time Wisely | 23,573 | exact | `user/how-to-have-a-life-an-ancient-guide-to-using-our-time-wisely-14861.md` |
| How to Win an Election: An Ancient Guide for Modern Politicians | 14,220 | weak | `user/how-to-win-an-election-an-ancient-guide-for-modern-politicians-quintus-tullius-13342.md` |

### 1e. Pre-1930 and movement classics -- CLEARED 2026-09-24 (6)

Free on their own facts. These carry NULL only because the *document* came from
`user` rather than from a corpus with a declared licence -- the licence question
is about the work, and the work is public domain or released.

**This group needs an actual write**, unlike the denials: `documents.license`
must be set per document, which no existing script does (`backfill_license.py`
only fills from the corpus policy, and the corpus policy for `user` is "none").

One caveat carried forward: *Socialism, Utopian and Scientific* is matched to a
single chapter (8,027 words of chapter 3), not the whole work. Engels 1880 is
public domain either way, but the row is a fragment.

| book | words | tier | doc |
|---|--:|---|---|
| Left-Wing Communism, An Infantile Disorder | 35,434 | weak | `user/left-wing-communism-an-infantile-disorder-vi-lenin-16219.md` |
| Hind Swaraj or Indian Home Rule | 31,771 | exact | `user/hind-swaraj-or-indian-home-rule-hind-swaraj-13248.md` |
| Socialism, Utopian and Scientific | 8,027 | weak | `user/socialism-utopian-and-scientific-chpt-3-15850.md` |
| The Principles of Communism | 7,933 | exact | `user/the-principles-of-communism-14552.md` |
| Memorial-and-Remonstrance | 2,727 | exact | `user/memorial-and-remonstrance-14330.md` |
| Universal Declaration of Human RIghts | 1,980 | weak | `user/universal-declaration-of-human-rights-united-nations-12391.md` |

### 1f. Genuinely individual -- open (23)

Everything else under the gate. These need a per-text call and no batch covers
them.

| book | words | tier | doc |
|---|--:|---|---|
| Work Without The Worker: Labour In The Age Of Platform Capitalism | 38,111 | strong | `user/work-without-the-workerlabour-in-the-age-of-platform-capitalism-by-15861.md` |
| Enduring Injustice: Race and the Death Penalty | 29,503 | strong | `user/enduring-injustice-race-and-the-death-penalty-2020-13117.md` |
| The Last Economy | 24,687 | exact | `user/the-last-economy-16036.md` |
| Unions Renewed: Building Power In an Age of Finance | 23,042 | exact | `user/unions-renewed-building-power-in-an-age-of-finance-13654.md` |
| Key to Health | 16,983 | exact | `user/key-to-health-14379.md` |
| The Structure of Proletarian Unfreedom | 13,505 | exact | `user/structure-of-proletarian-unfreedom-12286.md` |
| Third Class In Indian Railways | 12,615 | weak | `user/third-class-in-indian-railways-third-class-in-indian-railways-mahatma-gandhi-200-13835.md` |
| The New Jim Crow Study Guide and Call to Action | 10,284 | exact | `user/the-new-jim-crow-study-guide-and-call-to-action-13390.md` |
| We Need People Power to Address a World in Peril | 8,147 | weak | `user/people-power-to-address-a-world-in-peril-15007.md` |
| The Gender Accelerationist Manifesto | 7,435 | exact | `user/the-gender-accelerationist-manifesto-13219.md` |
| The Coal Strike of 1902: Turning Point in U.S. Policy | 6,250 | weak | `user/the-coal-strike-of-1902-turning-point-in-us-policy-us-department-of-labor-12403.md` |
| The Weakness of a Politics of Protest | 6,027 | exact | `user/the-weakness-of-a-politics-of-protest-16453.md` |
| Should College Be Free: The Economic Impact of Free College for 2025 | 5,540 | weak | `user/should-college-be-free-the-economic-impact-of-free-college-for-2025-researchc-15453.md` |
| To Spread the Revolution: Anarchist Archives and Libraries | 5,118 | weak | `user/jessica-moran-to-spread-the-revolution-anarchist-archives-and-libraries-15390.md` |
| Slavery and the Origins of the American Police State | 4,864 | exact | `user/slavery-and-the-origins-of-the-american-police-state-12886.md` |
| The Postmodern Left and the Success of Neoliberalism | 4,509 | exact | `user/the-postmodern-left-and-the-success-of-neoliberalism-14689.md` |
| A Theory of Justice: Revised Edition | 4,305 | exact | `user/a-theory-of-justice-revised-edition-14059.md` |
| Anarchism in the United States | 3,640 | exact | `user/anarchism-in-the-united-states-14593.md` |
| Just Get to Know Your Neighbors | 3,118 | weak | `user/just-get-to-know-your-neighbors-south-side-weekly-12233.md` |
| On the Commons | 2,979 | exact | `user/the-commons-12659.md` |
| Drugs are fucking everywhere (and we’re all addicted to comfort). | 2,302 | exact | `user/drugs-are-fucking-everywhere-and-were-all-addicted-to-comfort-15351.md` |
| Pavia Doctoral Address: Innovation Is Secondary When Freedom Is at Stake | 2,132 | exact | `user/pavia-doctoral-address-innovation-is-secondary-when-freedom-is-at-stake-13508.md` |
| The Leftwing Deadbeat | 2,002 | exact | `user/the-leftwing-deadbeat-15835.md` |

---

## 2. Held by the length gate (49 rows)

Licence-cleared, matched exactly, and still withheld: over 40,000 words. The
gate exists because `documents.license` is a *corpus-policy assertion*, not a
per-text finding, and it is least reliable exactly here -- the anarchist source
hosts book-length works by living authors it cannot relicense.

Leave these unless you know a specific one is genuinely free. Raising the gate
globally would publish all of them at once.

| book | words | source |
|---|--:|---|
| Living My Life | 424,238 | anarchist |
| The Third Revolution: Volume 4 | 315,987 | anarchist |
| The Desktop Regulatory State | 246,681 | anarchist |
| The Great French Revolution 1789-1793 | 204,259 | anarchist |
| Modern Science and Anarchy | 195,961 | anarchist |
| Memoirs of a Revolutionist | 159,059 | anarchist |
| The Unique and Its Property | 147,766 | anarchist |
| Studies in Mutualist Political Economy | 145,598 | anarchist |
| Means and Ends | 144,173 | anarchist |
| Anarchist Pedagogies | 140,768 | anarchist |
| The Spanish Anarchists | 128,080 | anarchist |
| Ethics: Origin and Development | 124,879 | anarchist |
| Demanding the Impossible | 123,357 | anarchist |
| Relationship Anarchy | 118,496 | anarchist |
| Individual Liberty | 114,908 | anarchist |
| A Short History of Anarchism | 113,885 | anarchist |
| Ideals and Realities in Russian Literature | 113,668 | anarchist |
| Re-enchanting Humanity | 112,730 | anarchist |
| The Failure of Nonviolence | 108,034 | anarchist |
| Militant Anti-Fascism | 104,315 | anarchist |
| Toward an Ecological Society | 100,543 | anarchist |
| The Revolution of Everyday Life | 95,795 | anarchist |
| Against Civilization | 95,296 | anarchist |
| Growing Up Absurd | 90,717 | anarchist |
| Post-Scarcity Anarchism | 88,189 | anarchist |
| Evasion | 87,866 | anarchist |
| Anarchy Works | 85,609 | anarchist |
| Against the Grain | 84,965 | anarchist |
| Our Synthetic Environment | 78,534 | anarchist |
| News from Nowhere | 78,261 | anarchist |
| Antifa: the Anti-fascist Handbook | 76,767 | anarchist |
| Anarchism and Education | 74,850 | anarchist |
| Gender | 74,360 | anarchist |
| Remaking Society | 73,853 | anarchist |
| The Conquest of Bread | 72,547 | anarchist |
| Anarchism and Other Essays | 68,014 | anarchist |
| On the Genealogy of Morals | 55,373 | anarchist |
| How Nonviolence Protects the State | 55,236 | anarchist |
| On Anarchism | 52,071 | anarchist |
| My Disillusionment In Russia | 51,964 | anarchist |
| Pure Freedom | 50,036 | anarchist |
| Shadow Work | 49,033 | anarchist |
| Bolo'bolo | 45,581 | anarchist |
| Two Cheers for Anarchism | 44,796 | anarchist |
| The Right to the City | 43,542 | anarchist |
| T.A.Z.: The Temporary Autonomous Zone, Ontological Anarchy | 42,524 | anarchist |
| Anarcho-syndicalism: Theory and Practice | 42,333 | anarchist |
| The Limits of the City | 40,457 | anarchist |
| The Abolition of Work and Other Essays | 40,043 | anarchist |

## 3. Matches below `exact` (38 rows)

Scored by normalised title alone, so a near-miss here can be a different book by
the same name, an abridgement, or a volume of a set. Worth an eye before any of
these is trusted -- including the ones already carrying a doc.

| score | tier | book | matched document |
|--:|---|---|---|
| 0.881 | weak | To Spread the Revolution: Anarchist Archives | Jessica Moran To Spread The Revolution Anarc |
| 0.882 | weak | How to Change Your Mind **(live)** | Change Your Mind |
| 0.882 | weak | Workers' Councils | Workers' Councils (1947) |
| 0.887 | weak | Urbanization Without Cities: The Rise and De | Planning Article Urbanization Without Cities |
| 0.893 | weak | The Third Revolution: Volume 4 | The Third Revolution |
| 0.895 | weak | Iron John: A Book About Men | Iron John  A Book About |
| 0.897 | weak | Should College Be Free: The Economic Impact  | Should College Be Free  The Economic Impact  |
| 0.897 | weak | The Sociology of Marx **(live)** | Sociology and Marxism |
| 0.901 | weak | Anarchism: A Very Short Introduction | Review of Anarchism: A Very Short Introducti |
| 0.901 | weak | Anarchism: A Very Short Introduction | Review of Anarchism: A Very Short Introducti |
| 0.903 | weak | How to Win an Election: An Ancient Guide for | How To Win An Election  An Ancient Guide For |
| 0.909 | weak | The Way to God | The Way to Go! |
| 0.911 | weak | Social Anarchism or Lifestyle Anarchism: An  | Social Anarchism Or Lifestyle Anarchism  An  |
| 0.917 | weak | Gaia's Garden: A Guide to Home-Scale Permacu | Gaia's Garden, Second Edition A Guide To Hom |
| 0.919 | weak | Left-Wing Communism, An Infantile Disorder | Left Wing Communism An Infantile Disorder Vi |
| 0.925 | weak | On the Duty of Civil Disobedience **(live)** | Civil Disobedience |
| 0.929 | weak | The Wretched of the Earth | The Wretched Of The Earth The Wretched Of Th |
| 0.933 | weak | We Need People Power to Address a World in P | People Power To Address A World In Peril |
| 0.935 | weak | Three Positions Against Prison **(live)** | 3 Positions Against Prison |
| 0.937 | weak | Socialism, Utopian and Scientific | Socialism Utopian and Scientific (Chpt. 2) |
| 0.937 | weak | Universal Declaration of Human RIghts | Universal Declaration of Human Rights   Unit |
| 0.940 | strong | Anarchists Getting Ourselves Together: A Pro **(live)** | Anarchists Getting Ourselves Together |
| 0.941 | strong | Enduring Injustice: Race and the Death Penal | Enduring-Injustice-Race-and-the-Death-Penalt |
| 0.941 | strong | The Third Revolution: Popular Movements in t | The Third Revolution Popular Movements In Th |
| 0.941 | strong | The Third Revolution: Popular Movements in t | The Third Revolution Popular Movements In Th |
| 0.949 | strong | Against Borders: The Case for Abolition | Against Borders  The Case For Abolition Grac |
| 0.951 | strong | Work Without The Worker: Labour In The Age O | Work Without The Workerlabour In The Age Of  |
| 0.954 | strong | How to Die: An Ancient Guide to the End of L | How To Die An Ancient Guide To The End Of |
| 0.971 | strong | Defund The Police: An International Insurrec | Defund The Police  An International Insurrec |
| 0.973 | strong | The Permaculture Garden | The Permaculture Gardener |
| 0.974 | strong | Debt The First 5,000 Years | Debt The First 5000 Years |
| 0.975 | strong | Economic & Philosophic Manuscripts of 1844 **(live)** | Economic & Philosophic Manuscripts |
| 0.980 | strong | Anarchism, Marxism and the Future of the Lef | Anarchism Marxism And The Future Of The Left |
| 0.984 | strong | Permaculture Design: A Step by Step Guide | Permaculture Design A Step-by-Step Guide - P |
| 0.986 | strong | Abundance: The Future Is Better Than You Thi | Abundance Abundance The Future Is Better Tha |
| 0.988 | strong | Centuries of Childhood: A Social History of  | Centuries Of Childhood A Social History Of F |
| 0.996 | strong | Seeing the Inadequacies of the Strategy Prop **(live)** | Seeing the Inadequacies of the Strategy Prop |
| 0.997 | strong | Crises of Global Economy and the Future of C | Crises Of Global Economy And The Future Of C |

## 4. Contested documents

**Four rows, down from six.** Two of the three collisions were fixed in the
matcher on 2026-09-24 rather than worked around.

An earlier revision of this file said each pair was the same book listed twice
and that the fix was deduplicating the reading list. That was wrong, and acting
on it would have deleted real entries. Each pair was two *different* texts the
matcher could not separate, because it matched on title and ignored everything
else.

**Resolved:**

- `Anarchism in the United States` -- Madison 1945 and Creagh/Kuhn/Cohn 2009,
  unrelated books sharing a title. Now bound to two different documents
  (3,640 and 3,585 words), and they carry different tag sets as a result.
- `Anarchism: A Very Short Introduction` -- Prichard 2022 and Ward 1981. Both
  had matched a 1,410-word *Review of* the book. Reviews, summaries and
  critiques are no longer treated as the text they discuss, so neither matches
  anything now, which is correct: the corpus holds no copy of either.

**Still contested, and correctly so:**

- doc 286 -- `The Third Revolution`, volumes 1 and 2. Two real texts; the corpus
  holds one document. No key can split one body between two books, so the export
  excludes both rather than guessing. This is the right outcome, not a defect.
- doc 9259 -- `Money: An Introductory Bibliography`, newly contested after the
  matcher began admitting author-corroborated near misses.

The repair to `apply-library-tags.mjs` stands and still matters: it had been
copying a contested document's tags onto *both* books, describing each with the
other's subjects. It skips contested documents and strips tags an earlier run
wrote.

## What would move the number

4 rows are licence-clear, under the gate, and still have no `doc`. Those are
the free wins and need no decision from you.

Section 1 used to read as 84 pending rights decisions. After the matcher fixes
and the batch rulings it is 23 -- 43 are moot under the word gate, 9 are matcher
defects rather than licence questions, and 18 were settled in three batches. The
23 are the real remaining question.

The larger prize is not in section 1 at all. Six of the stubs in 1b have a full
copy of the same work already sitting in the corpus, unmatched. Finding the rest
of that class -- every `[x]` row in the archived ImageOnly checklist is a
candidate -- would do more than any licence decision.


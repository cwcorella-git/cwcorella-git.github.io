# books.json <-> library corpus: what is still unresolved

Generated 2026-09-24 from `scripts/match-library.mjs` (the matcher that already
ships, not a new one) against `/data/library-api/library.db` on the workstation.
**Report only. Nothing in `books.json` was changed to produce this.**

Where things stand: 902 books, 262 matched to a corpus document, **128 currently
carry a `doc`**. The 134-row gap is not a matching failure -- it is three
separate holds, and only one of them is a judgement call you need to make.

| | rows | what it is |
|---|--:|---|
| carrying a doc already | 128 | done |
| licence needs review | 84 | **section 1 -- your call** |
| held by the 40k-word gate | 49 | section 2 -- deliberate |
| match quality below `exact` | 38 | section 3 -- check before trusting |

---

## 1. Licence needs review (84 rows)

These matched a document whose `license` column is NULL. NULL means *deny until
cleared*, never "no licence needed" -- so the export refuses them. Almost all are
`source: user`, i.e. texts you supplied rather than ones a corpus-wide licence
covers.

Clearing one means asserting you may republish that text on a public page. That
is why the script will not decide it.

**Checked 2026-09-24: there is nothing here an automatic pass can clear.** All
84 rows are `user` (80) or `youtube` (4), and `SOURCE_LICENSE` declares no
licence for either -- `user` is scraped third-party material including
in-copyright books, `youtube` is other people's video. The two sources that do
carry a corpus licence, `anarchist` and `marxist`, are already fully backfilled
(24,594 and 12,576 rows, zero NULLs), so `backfill_license.py` would set
nothing. These 84 are per-document judgements or they are nothing.

| book | words | tier | doc |
|---|--:|---|---|
| The Making of the English Working Class | 342,295 | exact | `user/the-making-of-the-english-working-class` |
| Debt The First 5,000 Years | 227,915 | strong | `user/debt-the-first-5000-years-15780.md` |
| Possibilities: Essays on Hierarchy, Rebellion, and Desire | 191,205 | exact | `user/possibilities-essays-on-hierarchy-rebel` |
| Centuries of Childhood: A Social History of Family Life | 184,968 | strong | `user/centuries-of-childhood-a-social-history` |
| Permaculture: Principles and Pathways beyond Sustainabilit | 165,458 | exact | `user/permaculture-principles-and-pathways-be` |
| Gaia's Garden: A Guide to Home-Scale Permaculture | 157,426 | weak | `user/gaias-garden-second-edition-a-guide-to-` |
| What is Property | 155,988 | exact | `user/what-is-property-15256.md` |
| The Ego and Its Own | 149,120 | exact | `user/the-ego-and-its-own-max-stirner-cambrid` |
| Crises of Global Economy and the Future of Capitalism: An  | 142,219 | strong | `user/crises-of-global-economy-and-the-future` |
| Bakunin on Anarchy | 142,195 | exact | `user/bakunin-on-anarchy-13770.md` |
| EcoCities: Rebuilding Cities in Balance with Nature | 139,100 | exact | `user/ecocities-rebuilding-cities-in-balance-` |
| How Europe Underdeveloped Africa | 136,477 | exact | `user/how-europe-underdeveloped-africa-12824.` |
| The Buddha & His Teachings | 134,161 | exact | `user/the-buddha-his-teachings-13278.md` |
| Abundance: The Future Is Better Than You Think | 112,558 | strong | `user/abundance-abundance-the-future-is-bette` |
| The Wretched of the Earth | 101,722 | weak | `user/the-wretched-of-the-earth-the-wretched-` |
| Workers' Councils | 101,248 | weak | `user/workers-councils-1947-16110.md` |
| Defund The Police: An International Insurrection | 95,750 | strong | `user/defund-the-police-an-international-insu` |
| What Is Communist Anarchism | 94,127 | exact | `user/what-is-communist-anarchism-13879.md` |
| A World Without Police | 91,009 | exact | `user/a-world-without-police-14230.md` |
| How We Fight White Supremacy | 90,503 | exact | `user/how-we-fight-white-supremacy-12298.md` |
| The Life of Milarepa | 87,580 | exact | `user/the-life-of-milarepa-12416.md` |
| A Brief History of Neoliberalism | 85,970 | exact | `user/a-brief-history-of-neoliberalism-16062.` |
| Law and the Utopian Imagination | 76,773 | exact | `user/law-and-the-utopian-imagination-13111.m` |
| How to Create Your Own Luck: The "You Never Know" Approach | 68,913 | exact | `user/how-to-create-your-own-luck-the-you-nev` |
| So You Want to Talk About Race | 68,250 | exact | `user/so-you-want-to-talk-about-race-12857.md` |
| How to Work a Room: Your Essential Guide to Savvy Socializ | 67,625 | exact | `user/how-to-work-a-room-your-essential-guide` |
| Global Capitalism and the Crisis of Humanity | 66,385 | exact | `user/global-capitalism-and-the-crisis-of-hum` |
| Teaching to Transgress: Education As The Practice of Freed | 64,668 | exact | `user/teaching-to-transgress-education-as-the` |
| In Defense of Housing: The Politics of Crisis | 62,186 | exact | `user/in-defense-of-housing-the-politics-of-c` |
| Right-Wing Collectivism: The Other Threat | 57,540 | exact | `user/right-wing-collectivism-the-other-threa` |
| Permaculture Design: A Step by Step Guide | 56,264 | strong | `user/permaculture-design-a-step-by-step-guid` |
| How to Talk With Practically Anybody About Practically Any | 55,952 | exact | `user/how-to-talk-with-practically-anybody-ab` |
| Blackshirts and Reds: Rational Fascism and the Overthrow o | 55,674 | exact | `user/blackshirts-and-reds-rational-fascism-a` |
| The End of Arrogance: America in the Global Competition of | 54,030 | exact | `user/the-end-of-arrogance-america-in-the-glo` |
| How to Win an Argument: An Ancient Guide to the Art of Per | 51,926 | exact | `user/how-to-win-an-argument-an-ancient-guide` |
| Anarchism, Marxism and the Future of the Left: Interviews  | 47,929 | strong | `user/anarchism-marxism-and-the-future-of-the` |
| Against Borders: The Case for Abolition | 46,405 | strong | `user/against-borders-the-case-for-abolition-` |
| Imagination: A Very Short Introduction | 40,306 | exact | `user/imagination-a-very-short-introduction-1` |
| Work Without The Worker: Labour In The Age Of Platform Cap | 38,111 | strong | `user/work-without-the-workerlabour-in-the-ag` |
| How to Die: An Ancient Guide to the End of Life | 37,348 | strong | `user/how-to-die-an-ancient-guide-to-the-end-` |
| Whither Anarchism? | 36,729 | exact | `user/whither-anarchism-13553.md` |
| Left-Wing Communism, An Infantile Disorder | 35,434 | weak | `user/left-wing-communism-an-infantile-disord` |
| Hind Swaraj or Indian Home Rule | 31,771 | exact | `user/hind-swaraj-or-indian-home-rule-hind-sw` |
| Social Ecology and Communalism | 31,318 | exact | `user/social-ecology-and-communalism-14992.md` |
| Social Anarchism or Lifestyle Anarchism: An Unbridgeable C | 30,218 | weak | `user/social-anarchism-or-lifestyle-anarchism` |
| Enduring Injustice: Race and the Death Penalty | 29,503 | strong | `user/enduring-injustice-race-and-the-death-p` |
| How to Keep Your Cool: An Ancient Guide to Anger Managemen | 28,005 | exact | `user/how-to-keep-your-cool-an-ancient-guide-` |
| How to Be a Friend: An Ancient Guide to True Friendship | 26,500 | exact | `user/how-to-be-a-friend-an-ancient-guide-to-` |
| How to Grow Old: Ancient Wisdom for the Second Half of Lif | 24,877 | exact | `user/how-to-grow-old-ancient-wisdom-for-the-` |
| The Last Economy | 24,687 | exact | `user/the-last-economy-16036.md` |
| How to Have a Life: An Ancient Guide to Using Our Time Wis | 23,573 | exact | `user/how-to-have-a-life-an-ancient-guide-to-` |
| Unions Renewed: Building Power In an Age of Finance | 23,042 | exact | `user/unions-renewed-building-power-in-an-age` |
| Key to Health | 16,983 | exact | `user/key-to-health-14379.md` |
| How to Win an Election: An Ancient Guide for Modern Politi | 14,220 | weak | `user/how-to-win-an-election-an-ancient-guide` |
| The Structure of Proletarian Unfreedom | 13,505 | exact | `user/structure-of-proletarian-unfreedom-1228` |
| The New Jim Crow Study Guide and Call to Action | 10,284 | exact | `user/the-new-jim-crow-study-guide-and-call-t` |
| What is Social Ecology | 9,099 | exact | `user/what-is-social-ecology-13241.md` |
| We Need People Power to Address a World in Peril | 8,147 | weak | `user/people-power-to-address-a-world-in-peri` |
| The Principles of Communism | 7,933 | exact | `user/the-principles-of-communism-14552.md` |
| The Weakness of a Politics of Protest | 6,027 | exact | `user/the-weakness-of-a-politics-of-protest-1` |
| Should College Be Free: The Economic Impact of Free Colleg | 5,540 | weak | `user/should-college-be-free-the-economic-imp` |
| To Spread the Revolution: Anarchist Archives and Libraries | 5,118 | weak | `user/jessica-moran-to-spread-the-revolution-` |
| The Revolt of the Masses | 5,028 | exact | `youtube/philosophize-this-11_art_culture_art` |
| Slavery and the Origins of the American Police State | 4,864 | exact | `user/slavery-and-the-origins-of-the-american` |
| The Postmodern Left and the Success of Neoliberalism | 4,509 | exact | `user/the-postmodern-left-and-the-success-of-` |
| The Road to Serfdom | 4,484 | exact | `youtube/philosophize-this-11_art_culture_art` |
| A Theory of Justice: Revised Edition | 4,305 | exact | `user/a-theory-of-justice-revised-edition-140` |
| Socialism, Utopian and Scientific | 3,214 | weak | `user/socialism-utopian-and-scientific-chpt-2` |
| Memorial-and-Remonstrance | 2,727 | exact | `user/memorial-and-remonstrance-14330.md` |
| Drugs are fucking everywhere (and we’re all addicted to co | 2,302 | exact | `user/drugs-are-fucking-everywhere-and-were-a` |
| Pavia Doctoral Address: Innovation Is Secondary When Freed | 2,132 | exact | `user/pavia-doctoral-address-innovation-is-se` |
| Universal Declaration of Human RIghts | 1,980 | weak | `user/universal-declaration-of-human-rights-u` |
| Free Cities: Communalism and the Left | 1,890 | exact | `user/free-cities-communalism-and-the-left-12` |
| The Myth of Non-Reformist Reforms | 853 | exact | `user/the-myth-of-non-reformist-reforms-15664` |
| Pedagogy of the Oppressed | 283 | exact | `user/pedagogy-of-the-oppressed-13001.md` |
| The Permaculture Garden | 160 | strong | `youtube/discover-permaculture-09_environment` |
| Urbanization Without Cities: The Rise and Decline of Citiz | 130 | weak | `user/planning-article-urbanization-without-c` |
| The Ecology of Freedom: The Emergence and Dissolution of H | 125 | exact | `user/the-ecology-of-freedom-the-emergence-an` |
| Education for Critical Consciousness | 115 | exact | `user/education-for-critical-conssciousness-1` |
| The Third Revolution: Popular Movements in the Revolutiona | 106 | strong | `user/the-third-revolution-popular-movements-` |
| The Third Revolution: Popular Movements in the Revolutiona | 106 | strong | `user/the-third-revolution-popular-movements-` |
| The Philosophy of Social Ecology: Essays on Dialectical Na | 64 | exact | `user/the-philosophy-of-social-ecology-essays` |
| Iron John: A Book About Men | 34 | weak | `user/iron-john-a-book-about-12427.md` |
| The Way to God | 15 | weak | `youtube/brandonjla-12_reference_manuals_arti` |

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

Six rows share a document with another book, and the export excludes all of
them rather than guessing which book owns the text.

**Corrected 2026-09-24.** An earlier revision of this file said each pair was
the same book listed twice and that the fix was deduplicating the reading list.
That was wrong, and acting on it would have deleted real entries. Each pair is
two *different* texts the matcher cannot separate, because it matches on title
and ignores author and volume:

- `Anarchism in the United States` -- Madison 1945 and Creagh/Kuhn/Cohn 2009 are
  unrelated books that happen to share a title.
- `The Third Revolution` -- volumes 1 and 2, same author, same series.
- `Anarchism: A Very Short Introduction` -- Prichard 2022 and Ward 1981.

So the fix is in the matcher (a second key: author, or year), not in the
reading list. Until then, excluding all six is the correct behaviour. One
consequence has been repaired: `apply-library-tags.mjs` had been copying the
contested document's tags onto *both* books, which described each one with the
other's subjects. It now skips contested documents and removes tags an earlier
run had written.

- doc 14477 -- Anarchism in the United States
- doc 286 -- The Third Revolution: Popular Movements in the Revolutionary Era
- doc 3643 -- Anarchism: A Very Short Introduction

## What would move the number

4 rows are licence-clear, under the gate, and still have no `doc`. Those are
the free wins and need no decision from you. The 84 in section 1 are the real
question, and they are where most of the remaining words are.


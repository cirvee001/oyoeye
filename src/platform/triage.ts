import type { CategoryId, Severity, Triage } from './types';

// Rule-based stand-in for the AI triage service. It only ever *suggests*:
// security reports always go to a human in the control room, and the
// suggestion is shown to them with the signals that produced it.

interface Rule {
  category: CategoryId;
  subcategory?: string;
  words: string[];
  severity?: Severity;
}

const RULES: Rule[] = [
  // Security
  { category: 'security', subcategory: 'kidnapping', severity: 'critical', words: ['kidnap', 'kidnapped', 'kidnapping', 'kidnappers', 'abduct', 'abduction', 'ji gbe', 'ajinigbe', 'carry am go', 'ransom'] },
  { category: 'security', subcategory: 'robbery', severity: 'critical', words: ['robbery', 'robber', 'robbed', 'armed robber', 'ole', 'breaking in', 'break in', 'burglar', 'burglary', 'dem dey rob'] },
  { category: 'security', subcategory: 'armed', severity: 'critical', words: ['gun', 'weapon', 'rifle', 'ibon', 'machete', 'cutlass', 'ada', 'armed', 'shooting', 'gunshot', 'shot'] },
  { category: 'security', subcategory: 'violence', severity: 'high', words: ['cult', 'cultist', 'clash', 'fight', 'riot', 'mob', 'ija', 'attack', 'stabbed', 'beating'] },
  { category: 'security', subcategory: 'gbv', severity: 'high', words: ['rape', 'raped', 'sexual', 'sexually', 'defile', 'defiled', 'domestic violence', 'beats his wife', 'beats her', 'abuse', 'molest', 'molested'] },
  { category: 'security', subcategory: 'threat', severity: 'normal', words: ['threat', 'threaten', 'threatening', 'intimidate', 'intimidating', 'intimidation', 'extort', 'extortion', 'harass', 'harassment'] },
  { category: 'security', subcategory: 'suspicious', severity: 'high', words: ['suspicious', 'strange men', 'loitering', 'surveillance', 'dey look', 'stranger', 'unknown men'] },
  { category: 'security', subcategory: 'tip', severity: 'normal', words: ['hideout', 'den', 'information about', 'i know where', 'they meet', 'planning to'] },
  // Fire
  { category: 'fire', subcategory: 'electrical', severity: 'critical', words: ['transformer fire', 'transformer on fire', 'transformer dey burn'] },
  { category: 'fire', subcategory: 'building', severity: 'critical', words: ['fire', 'burning', 'smoke', 'flames', 'ina', 'on fire', 'gutted'] },
  { category: 'fire', subcategory: 'bush', severity: 'high', words: ['bush burning', 'bush fire'] },
  // Flooding
  { category: 'flooding', subcategory: 'drainage', severity: 'normal', words: ['drainage', 'gutter', 'drain', 'culvert', 'overflowing', 'blocked drain', 'ojuna'] },
  { category: 'flooding', subcategory: 'flood', severity: 'high', words: ['flood', 'flooded', 'flooding', 'ikun omi', 'omiyale', 'water everywhere', 'submerged', 'trapped'] },
  // Roads
  { category: 'roads', subcategory: 'state_road', severity: 'high', words: ['expressway', 'highway', 'ring road', 'iwo road', 'challenge road', 'bypass', 'dual carriageway'] },
  { category: 'roads', subcategory: 'local_road', severity: 'normal', words: ['road', 'pothole', 'collapsed', 'ona', 'bridge', 'crater', 'street'] },
  // Waste
  { category: 'waste', subcategory: 'dumping', severity: 'normal', words: ['dumping', 'dumped', 'illegal dump'] },
  { category: 'waste', subcategory: 'refuse', severity: 'normal', words: ['refuse', 'waste', 'rubbish', 'garbage', 'panti', 'dirt', 'dirty', 'smell', 'sanitation', 'dustbin'] },
  // Infrastructure
  { category: 'infrastructure', subcategory: 'electrical', severity: 'high', words: ['electric pole', 'fallen pole', 'naked wire', 'exposed cable', 'live wire', 'transformer', 'sparking', 'nepa'] },
  { category: 'infrastructure', subcategory: 'streetlight', severity: 'low', words: ['streetlight', 'street light', 'no light on the road'] },
  { category: 'infrastructure', subcategory: 'water', severity: 'normal', words: ['burst pipe', 'pipe burst', 'water pipe', 'borehole'] },
  { category: 'infrastructure', subcategory: 'facility', severity: 'low', words: ['abandoned', 'school building', 'health centre', 'clinic', 'market stall', 'vandal', 'vandalised'] },
];

const ESCALATORS: { words: string[]; to: Severity; signal: string }[] = [
  { words: ['now', 'right now', 'happening', 'in progress', 'currently', 'bayi', 'as i dey talk'], to: 'critical', signal: 'Happening now' },
  { words: ['injured', 'bleeding', 'dead', 'body', 'died', 'children', 'trapped', 'hostage'], to: 'critical', signal: 'People at risk' },
  { words: ['many people', 'crowd', 'whole street', 'entire area', 'everywhere'], to: 'high', signal: 'Wide impact' },
];

const YORUBA = ['omi', 'ina', 'ona', 'ole', 'ibon', 'panti', 'ija', 'bayi', 'ikun', 'ada', 'ajinigbe', 'ti po ju'];
const PIDGIN = ['dey', 'dem', 'wetin', 'abeg', 'una', 'don'];

const ORDER: Severity[] = ['low', 'normal', 'high', 'critical'];
const maxSev = (a: Severity, b: Severity) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A3: whole-word matching. A keyword matches only as a whole word (allowing
 * simple English endings), so 'ona' (road) no longer matches inside 'Onireke'
 * and 'ole' (thief) no longer matches inside 'Molete'.
 */
function hits(text: string, word: string) {
  return new RegExp(`(^|[^a-z])${esc(word)}(s|es|ed|d|ing|er|ers)?(?![a-z])`).test(text);
}

const fold = (raw: string) => ' ' + raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';

/** A3: remove place names (LGA and area names from the gazetteer) before matching, longest first. */
function stripPlaces(text: string, gazetteer: string[]) {
  const names = [...new Set(gazetteer.map((g) => fold(g).trim()).filter((g) => g.length > 1))].sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of names) out = out.replace(new RegExp(`(^|[^a-z])${esc(n)}(?![a-z])`, 'g'), '$1 ');
  return out;
}

export function triage(raw: string, hint?: { category?: CategoryId; subcategory?: string; sos?: boolean }, gazetteer: string[] = []): Triage {
  // "Not sure" is the same as no hint.
  if (hint?.category === 'other') hint = { ...hint, category: undefined, subcategory: undefined };
  const full = fold(raw);
  const text = gazetteer.length ? stripPlaces(full, gazetteer) : full;
  const signals: string[] = [];
  const scores = new Map<string, { rule: Rule; n: number; words: string[] }>();
  for (const rule of RULES) {
    const matched = rule.words.filter((w) => hits(text, w));
    if (!matched.length) continue;
    const key = `${rule.category}/${rule.subcategory}`;
    const prev = scores.get(key);
    scores.set(key, { rule, n: (prev?.n ?? 0) + matched.length, words: [...(prev?.words ?? []), ...matched] });
  }
  // Security outranks everything when it matches; then by hit count.
  const ranked = [...scores.values()].sort(
    (a, b) => (b.rule.category === 'security' ? 1 : 0) - (a.rule.category === 'security' ? 1 : 0) || b.n - a.n,
  );
  const best = ranked[0];

  // A4: no keywords and no category → "Unclassified", read by a person. Never Security by default.
  let category: CategoryId = hint?.category ?? best?.rule.category ?? 'other';
  let subcategory = hint?.subcategory ?? (best && best.rule.category === category ? best.rule.subcategory : category === 'other' ? 'unclassified' : undefined);
  let severity: Severity = best?.rule.severity ?? 'normal';
  let confidence = best ? Math.min(0.95, 0.45 + best.n * 0.18) : 0.2;
  if (best) signals.push(`Keywords: ${[...new Set(best.words)].slice(0, 4).join(', ')}`);
  else signals.push('No clear keywords — needs a person to read it');

  if (hint?.category && best && best.rule.category !== hint.category) {
    signals.push(`Reporter chose ${hint.category}; text suggests ${best.rule.category}`);
    confidence = Math.min(confidence, 0.5);
  }
  if (hint?.category && !best) confidence = 0.6;

  for (const e of ESCALATORS) {
    if (e.words.some((w) => hits(text, w))) {
      severity = maxSev(severity, e.to);
      signals.push(e.signal);
    }
  }
  if (hint?.sos) {
    category = 'security';
    subcategory = hint.subcategory ?? (subcategory && best?.rule.category === 'security' ? subcategory : 'sos');
    severity = 'critical';
    confidence = Math.max(confidence, 0.5);
    signals.unshift('SOS button pressed');
  }
  if (category === 'security' && severity === 'low') severity = 'normal';

  const yo = YORUBA.some((w) => hits(full, w));
  const pcm = PIDGIN.some((w) => hits(full, w));
  const language = yo && pcm ? 'mixed' : yo ? 'yo' : pcm ? 'pcm' : 'en';
  if (language !== 'en') signals.push(`Language: ${language === 'yo' ? 'Yoruba' : language === 'pcm' ? 'Pidgin' : 'mixed'}`);

  return { category, subcategory, severity, confidence: Math.round(confidence * 100) / 100, signals, language };
}

export function titleFor(text: string, max = 64) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const first = clean.split(/(?<=[.!?])\s/)[0];
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

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
  { category: 'security', subcategory: 'kidnapping', severity: 'critical', words: ['kidnap', 'abduct', 'ji gbe', 'ajinigbe', 'carry am go', 'ransom'] },
  { category: 'security', subcategory: 'robbery', severity: 'critical', words: ['robbery', 'robbers', 'armed robber', 'ole', 'breaking in', 'break in', 'burglar', 'dem dey rob'] },
  { category: 'security', subcategory: 'armed', severity: 'critical', words: ['gun', 'guns', 'weapon', 'rifle', 'ibon', 'machete', 'cutlass', 'ada', 'armed', 'shooting', 'gunshot', 'shots'] },
  { category: 'security', subcategory: 'violence', severity: 'high', words: ['cult', 'clash', 'fight', 'fighting', 'riot', 'mob', 'ija', 'attack', 'stabbed', 'beating'] },
  { category: 'security', subcategory: 'gbv', severity: 'high', words: ['rape', 'raped', 'sexual', 'defile', 'domestic violence', 'beats his wife', 'beats her', 'abuse', 'abused', 'molest'] },
  { category: 'security', subcategory: 'threat', severity: 'normal', words: ['threat', 'threaten', 'intimidat', 'extort', 'harass'] },
  { category: 'security', subcategory: 'suspicious', severity: 'high', words: ['suspicious', 'strange men', 'loitering', 'surveillance', 'dey look', 'strangers', 'unknown men'] },
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
  { category: 'roads', subcategory: 'local_road', severity: 'normal', words: ['road', 'pothole', 'potholes', 'collapsed', 'ona', 'bridge', 'crater', 'street'] },
  // Waste
  { category: 'waste', subcategory: 'dumping', severity: 'normal', words: ['dumping', 'dumped', 'illegal dump'] },
  { category: 'waste', subcategory: 'refuse', severity: 'normal', words: ['refuse', 'waste', 'rubbish', 'garbage', 'panti', 'dirt', 'smell', 'sanitation', 'dustbin'] },
  // Infrastructure
  { category: 'infrastructure', subcategory: 'electrical', severity: 'high', words: ['electric pole', 'fallen pole', 'naked wire', 'exposed cable', 'live wire', 'transformer', 'sparking', 'nepa'] },
  { category: 'infrastructure', subcategory: 'streetlight', severity: 'low', words: ['streetlight', 'street light', 'no light on the road'] },
  { category: 'infrastructure', subcategory: 'water', severity: 'normal', words: ['burst pipe', 'pipe burst', 'water pipe', 'borehole'] },
  { category: 'infrastructure', subcategory: 'facility', severity: 'low', words: ['abandoned', 'school building', 'health centre', 'clinic', 'market stall', 'vandal'] },
];

const ESCALATORS: { words: string[]; to: Severity; signal: string }[] = [
  { words: ['now', 'right now', 'happening', 'in progress', 'currently', 'bayi', 'as i dey talk'], to: 'critical', signal: 'Happening now' },
  { words: ['injured', 'bleeding', 'dead', 'body', 'died', 'children', 'trapped', 'hostage'], to: 'critical', signal: 'People at risk' },
  { words: ['many people', 'crowd', 'whole street', 'entire area', 'everywhere'], to: 'high', signal: 'Wide impact' },
];

const YORUBA = ['omi', 'ina', 'ona', 'ole', 'ibon', 'panti', 'ija', 'bayi', 'ikun', 'ada', 'ajinigbe'];
const PIDGIN = ['dey', 'dem', 'wetin', 'abeg', 'una', 'don'];

const ORDER: Severity[] = ['low', 'normal', 'high', 'critical'];
const maxSev = (a: Severity, b: Severity) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

function hits(text: string, word: string) {
  if (word.includes(' ')) return text.includes(word);
  return new RegExp(`(^|[^a-z])${word}`).test(text);
}

export function triage(raw: string, hint?: { category?: CategoryId; subcategory?: string; sos?: boolean }): Triage {
  const text = ' ' + raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
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
  let best = ranked[0];

  let category: CategoryId = hint?.category ?? best?.rule.category ?? 'security';
  let subcategory = hint?.subcategory ?? (best && best.rule.category === category ? best.rule.subcategory : undefined);
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
    subcategory = subcategory && best?.rule.category === 'security' ? subcategory : 'sos';
    severity = 'critical';
    confidence = Math.max(confidence, 0.5);
    signals.unshift('SOS button pressed');
  }
  if (category === 'security' && severity === 'low') severity = 'normal';

  const yo = YORUBA.some((w) => hits(text, w));
  const pcm = PIDGIN.some((w) => hits(text, w));
  const language = yo && pcm ? 'mixed' : yo ? 'yo' : pcm ? 'pcm' : 'en';
  if (language !== 'en') signals.push(`Language: ${language === 'yo' ? 'Yoruba' : language === 'pcm' ? 'Pidgin' : 'mixed'}`);

  return { category, subcategory, severity, confidence: Math.round(confidence * 100) / 100, signals, language };
}

export function titleFor(text: string, max = 64) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const first = clean.split(/(?<=[.!?])\s/)[0];
  return first.length > max ? first.slice(0, max - 1).trimEnd() + '…' : first;
}

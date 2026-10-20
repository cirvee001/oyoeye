import type { CategoryId, Incident, Status } from './platform/types';
import { useStore } from './store';

// One plain-language label per status, used everywhere (citizen, staff, dashboards).
export const STATUS_ORDER: Status[] = ['pending', 'verified', 'assigned', 'accepted', 'in_progress', 'resolved', 'closed'];
export const SIDE_STATUSES: Status[] = ['reopened', 'rejected', 'referred'];

export const STATUS_TONE: Record<Status, string> = {
  pending: 'st-pending',
  verified: 'st-verified',
  assigned: 'st-assigned',
  accepted: 'st-accepted',
  in_progress: 'st-progress',
  resolved: 'st-resolved',
  closed: 'st-closed',
  reopened: 'st-reopened',
  rejected: 'st-rejected',
  referred: 'st-referred',
};

/** Strong colour per status (PRD v2.1 §5); pills use the soft background in styles.css. */
export const STATUS_COLOR: Record<Status, string> = {
  pending: '#B58A00',
  verified: '#1D4ED8',
  assigned: '#1D4ED8',
  accepted: '#4338CA',
  in_progress: '#B45309',
  resolved: '#15803D',
  closed: '#0B6E4F',
  reopened: '#D92D20',
  rejected: '#98A2B3',
  referred: '#7E22CE',
};

// The string tables live in ./strings (no store import). DRAFT — needs native-speaker review.
export { STRINGS, tr, msg, msgText, errText, missingStrings, ussdText, type Lang, type StrKey, type Msg, type MsgKey, type Params } from './strings';
import { tr, missingStrings, type Lang, type Params, type StrKey } from './strings';
import { currentLang } from './store';

/** The language for this screen: a signed-in citizen's or focal person's saved choice, the device choice for guests, English for staff. */
export function useLang(): [Lang, (k: StrKey, p?: Params) => string] {
  const lang = useStore(currentLang);
  return [lang, (k: StrKey, p?: Params) => tr(k, lang, p)];
}

export function statusLabel(i: Pick<Incident, 'status' | 'verification'>, lang: Lang = 'en') {
  if (i.status === 'closed' && i.verification === 'timeout') return tr('st.closed_unconfirmed', lang);
  return tr(`st.${i.status}` as StrKey, lang);
}

export const catLabel = (c: CategoryId, lang: Lang = 'en') => tr(`cat.${c}` as StrKey, lang);
/** Plain explanation of a status for citizens, e.g. "Verified — the 615 control room has checked your report". */
export const statusExplain = (i: Pick<Incident, 'status'>, lang: Lang = 'en') => tr(`stx.${i.status}` as StrKey, lang);

// ---------- v2.4: onboarding and the OyoEye Rule Book ----------
// DRAFT — needs native-speaker review (every Yoruba string below).

export interface RuleText {
  icon: string;
  title: [string, string];
  why: [string, string];
  /** Extra bullet points (rule 3). */
  points?: [string, string][];
  note?: [string, string];
}

export const ONBOARDING: { title: [string, string]; body: [string, string]; icon: string }[] = [
  {
    icon: 'home',
    title: ['Welcome to OyoEye', 'Ẹ káàbọ̀ sí OyoEye'],
    body: ['See it. Report it. We act on it. OyoEye connects you to the 615 control room, Police, Amotekun and state agencies.', 'Rí i. Ròyìn rẹ̀. A ó gbé ìgbésẹ̀. OyoEye so yín pọ̀ mọ́ yàrá ìṣàkóso 615, Ọlọ́pàá, Àmọ̀tẹ́kùn àti àwọn ilé-iṣẹ́ ìjọba.'],
  },
  {
    icon: 'sos',
    title: ['Two ways to ask for help', 'Ọ̀nà méjì láti béèrè ìrànlọ́wọ́'],
    body: ['SOS for danger happening now: press and hold. Report a problem for anything else: roads, waste, flooding, suspicious activity. No smartphone? Dial *615# or call 615.', 'SOS fún ewu tó ń ṣẹlẹ̀ báyìí: tẹ̀ ẹ́ mú. Ròyìn ìṣòro fún nǹkan míì: ọ̀nà, pàǹtí, ìkún omi, ìwà àìfọkàntán. Kò ní fóònù olóye? Tẹ *615# tàbí pe 615.'],
  },
  {
    icon: 'list',
    title: ['Follow your report', 'Tẹ̀lé ìròyìn yín'],
    body: ['Every report gets a number. You’ll see each step: Pending → Verified → Assigned → In progress → Resolved → Closed. We’ll tell you when it moves.', 'Ìròyìn kọ̀ọ̀kan ní nọ́mbà. Ẹ ó rí ìgbésẹ̀ kọ̀ọ̀kan: Ń dúró → A fìdí múlẹ̀ → A fi ránṣẹ́ → Iṣẹ́ ń lọ → A yanjú → A parí. A ó sọ fún yín tí ó bá yí padà.'],
  },
  {
    icon: 'security',
    title: ['You are protected', 'A dáàbò bò yín'],
    body: ['Choose Standard, Confidential or Anonymous. Officers in the field never see who reported. Help is free: never pay anyone.', 'Yan Déédé, Àṣírí tàbí Láìsí orúkọ. Àwọn òṣìṣẹ́ kò ní mọ ẹni tó ròyìn. Ìrànlọ́wọ́ jẹ́ ọ̀fẹ́: ẹ má ṣe sanwó fún ẹnikẹ́ni.'],
  },
  {
    icon: 'file',
    title: ['The Rule Book', 'Ìwé Òfin'],
    body: ['Next: 8 short rules that keep OyoEye working for everyone →', 'Èyí tó kàn: òfin kúkúrú mẹ́jọ tó jẹ́ kí OyoEye ṣiṣẹ́ fún gbogbo ènìyàn →'],
  },
];

export const RULES: RuleText[] = [
  {
    icon: 'check',
    title: ['Tell the truth, as you saw it.', 'Sọ òótọ́, bí ẹ ṣe rí i.'],
    why: ['Say what you saw or heard, not what you guess. “Three men with cutlasses near the mosque” helps more than “criminals everywhere”.', 'Sọ ohun tí ẹ rí tàbí gbọ́, kì í ṣe ohun tí ẹ ròó. “Ọkùnrin mẹ́ta pẹ̀lú àdá nítòsí mọ́ṣáláṣí” wúlò ju “àwọn ọ̀daràn níbi gbogbo”.'],
  },
  {
    icon: 'sos',
    title: ['SOS is for danger happening now.', 'SOS wà fún ewu tó ń ṣẹlẹ̀ báyìí.'],
    why: ['Use SOS when someone is in danger right now. For everything else, use Report a problem. It still reaches the right people.', 'Lo SOS tí ẹnìkan bá wà nínú ewu báyìí. Fún nǹkan míì, lo Ròyìn ìṣòro. Ó ṣì máa dé ọ̀dọ̀ àwọn tó yẹ.'],
  },
  {
    icon: 'alert',
    title: ['Fake alarms put real lives at risk.', 'Ìròyìn èké ń fi ẹ̀mí èèyàn sínú ewu.'],
    why: ['Every false alarm sends officers away from someone who really needs them.', 'Ìròyìn èké kọ̀ọ̀kan ń mú àwọn òṣìṣẹ́ kúrò lọ́dọ̀ ẹni tó nílò wọn gan-an.'],
    points: [
      ['Reporting something on purpose that you know is false lowers your reporter standing. Your future reports may then need a call-back before help is sent.', 'Tí ẹ bá mọ̀ọ́mọ̀ ròyìn èké, ipò yín gẹ́gẹ́ bí oníròyìn yóò lọ sílẹ̀. Ìròyìn yín tó kàn lè nílò ìpè padà kí a tó rán ìrànlọ́wọ́.'],
      ['Deliberate hoaxes can be prosecuted.', 'A lè pe ẹni tó mọ̀ọ́mọ̀ ròyìn èké lẹ́jọ́.'],
    ],
    note: ['Honest mistakes are fine: if you reported in good faith and it turned out to be nothing, that doesn’t count against you.', 'Àṣìṣe òtítọ́ kò burú: tí ẹ bá ròyìn pẹ̀lú ọkàn rere tí kò sì jẹ́ nǹkankan, kò ní kà sí yín lọ́rùn.'],
  },
  {
    icon: 'security',
    title: ['Your safety comes first.', 'Ààbò yín ló ṣáájú.'],
    why: ['Don’t follow, confront or film attackers. Move to a safe place, then report.', 'Ẹ má tẹ̀lé, ẹ má kojú, ẹ má sì ya àwòrán àwọn olùkọlù. Ẹ lọ sí ibi tó láàbò, lẹ́yìn náà ẹ ròyìn.'],
  },
  {
    icon: 'officers',
    title: ['No jungle justice.', 'Kò sí ìdájọ́ ọwọ́ ara ẹni.'],
    why: ['Never beat, burn or “deal with” a suspect yourself, and don’t gather a crowd. Hand them over, report, and let responders act. Mob action is a crime and gets innocent people killed.', 'Ẹ má lu, ẹ má sun, ẹ má sì “ṣe” afurasí fúnra yín, ẹ má sì kó èrò jọ. Ẹ fà á lé lọ́wọ́, ẹ ròyìn, kí àwọn òṣìṣẹ́ ṣiṣẹ́ wọn. Ìwà ìjàgídíjàgan jẹ́ ẹ̀ṣẹ̀, ó sì ń pa aláìṣẹ̀.'],
  },
  {
    icon: 'other',
    title: ['Describe actions, not tribes.', 'Ṣàpèjúwe ìwà, kì í ṣe ẹ̀yà.'],
    why: ['Say what people did and what they look like, not their ethnic group or religion. “Two men on a motorcycle with guns”, not “Fulani people” or “Igbo boys”. This keeps responses fair and keeps our communities together.', 'Sọ ohun tí wọ́n ṣe àti bí wọ́n ṣe rí, kì í ṣe ẹ̀yà tàbí ẹ̀sìn wọn. “Ọkùnrin méjì lórí ọ̀kadà pẹ̀lú ìbọn”, kì í ṣe “àwọn Fúlàní” tàbí “àwọn ọmọ Igbo”. Èyí jẹ́ kí ìdáhùn jẹ́ òdodo, kí àwùjọ wa sì wà ní ìṣọ̀kan.'],
  },
  {
    icon: 'key',
    title: ['Help is free. Never pay.', 'Ìrànlọ́wọ́ jẹ́ ọ̀fẹ́. Ẹ má sanwó.'],
    why: ['Police, Amotekun and 615 help is free. If anyone asks you for money or “something for the boys”, report it. Your complaint goes to an independent panel, not to the officer’s unit.', 'Ìrànlọ́wọ́ Ọlọ́pàá, Àmọ̀tẹ́kùn àti 615 jẹ́ ọ̀fẹ́. Tí ẹnikẹ́ni bá béèrè owó tàbí “nǹkan fún àwọn ọmọkùnrin”, ẹ ròyìn rẹ̀. Ẹ̀sùn yín máa lọ sí ìgbìmọ̀ aláìdásí, kì í ṣe sí ẹ̀ka òṣìṣẹ́ náà.'],
  },
  {
    icon: 'camera',
    title: ['Respect privacy.', 'Bọ̀wọ̀ fún àṣírí ènìyàn.'],
    why: ['Don’t post victims’ photos or names on WhatsApp or social media. Share them only through OyoEye, where they are protected. Confirm honestly when we ask “Is it fixed?”.', 'Ẹ má fi àwòrán tàbí orúkọ àwọn olùfaragbá sórí WhatsApp tàbí ẹ̀rọ ayélujára. Ẹ fi wọ́n ránṣẹ́ nípasẹ̀ OyoEye nìkan, níbi tí a ti dáàbò bò wọ́n. Ẹ sọ òótọ́ nígbà tí a bá béèrè “Ṣé wọ́n ti ṣe é?”.'],
  },
];

export const RULES_CLOSING: [string, string] = ['OyoEye works when we all use it honestly. Thank you for keeping Oyo safe.', 'OyoEye ń ṣiṣẹ́ nígbà tí gbogbo wa bá lò ó pẹ̀lú òtítọ́. A dúpẹ́ pé ẹ ń pa Ọ̀yọ́ mọ́ láàbò.'];
export const AGREE: [string, string] = ['I understand and agree', 'Mo yé mi, mo sì gbà'];
/** The three key rules shown to anonymous reporters (§3.1.2). */
export const KEY_RULES = [0, 2, 6];
export const pick = (t: [string, string], lang: Lang) => t[lang === 'yo' ? 1 : 0];

/** Every Yoruba text a citizen or focal person can see, counted for Demo controls (should be 0 missing). */
export function missingTranslations(): string[] {
  const out = missingStrings();
  const pairs: [string, [string, string] | undefined][] = [
    ...ONBOARDING.flatMap((o, k) => [['onboarding.' + k + '.title', o.title], ['onboarding.' + k + '.body', o.body]] as [string, [string, string]][]),
    ...RULES.flatMap((r, k) => [['rule.' + k + '.title', r.title], ['rule.' + k + '.why', r.why], ['rule.' + k + '.note', r.note], ...(r.points ?? []).map((p, j) => ['rule.' + k + '.point' + j, p])] as [string, [string, string] | undefined][]),
    ['rules.closing', RULES_CLOSING],
    ['rules.agree', AGREE],
  ];
  for (const [k, v] of pairs) if (v && !v[1]?.trim()) out.push(k);
  return out;
}

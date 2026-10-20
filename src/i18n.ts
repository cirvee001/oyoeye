import type { CategoryId, Incident, Status } from './platform/types';
import { useStore } from './store';

export type Lang = 'en' | 'yo';

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

// Yoruba strings are DRAFT TRANSLATIONS for the prototype. They must be
// reviewed by a native speaker / the state language unit before any pilot.
const STRINGS = {
  // statuses
  'st.pending': ['Pending review', 'Ń dúró de àyẹ̀wò'],
  'st.verified': ['Verified', 'A ti fìdí rẹ̀ múlẹ̀'],
  'st.assigned': ['Assigned', 'A ti fi ránṣẹ́'],
  'st.accepted': ['Accepted', 'Wọ́n ti gbà á'],
  'st.in_progress': ['In progress', 'Iṣẹ́ ń lọ lọ́wọ́'],
  'st.resolved': ['Resolved', 'A ti yanjú rẹ̀'],
  'st.closed': ['Closed', 'A ti parí rẹ̀'],
  'st.reopened': ['Reopened', 'A tún un ṣí'],
  'st.rejected': ['Rejected', 'A kọ̀ ọ́'],
  'st.referred': ['Referred', 'A ti fi ránṣẹ́ fún ìwádìí'],
  'st.closed_unconfirmed': ['Closed — unconfirmed', 'A ti parí rẹ̀ — láìsí ìdáhùn'],
  // categories
  'cat.security': ['Security', 'Ààbò'],
  'cat.fire': ['Fire', 'Iná'],
  'cat.flooding': ['Flooding', 'Ìkún omi'],
  'cat.roads': ['Roads', 'Ọ̀nà'],
  'cat.waste': ['Waste', 'Pàǹtí'],
  'cat.infrastructure': ['Infrastructure', 'Ohun èlò ìlú'],
  'cat.other': ['Not sure', 'Mi ò dá a lójú'],
  // citizen home
  'home.hello': ['Hello', 'Ẹ n lẹ́ o'],
  'home.report': ['Report a problem', 'Ròyìn ìṣòro kan'],
  'home.report.sub': ['Roads, waste, flooding, security…', 'Ọ̀nà, pàǹtí, ìkún omi, ààbò…'],
  'home.mine': ['My reports', 'Àwọn ìròyìn mi'],
  'home.mine.sub': ['See where each report is', 'Wo ibi tí ìròyìn kọ̀ọ̀kan dé'],
  'home.sos': ['SOS — I need help now', 'SOS — Mo nílò ìrànlọ́wọ́ báyìí'],
  'home.sos.sub': ['Press and hold. Goes straight to the 615 control room.', 'Tẹ̀ ẹ́ mú. Ó lọ tààrà sí yàrá ìṣàkóso 615.'],
  'home.track': ['Track a report', 'Tọpinpin ìròyìn kan'],
  // report flow
  'r.step': ['Step', 'Ìgbésẹ̀'],
  'r.of': ['of', 'nínú'],
  'r.what': ['What happened?', 'Kí ló ṣẹlẹ̀?'],
  'r.what.sub': ['Pick one, or "Not sure". Then tell us in your own words.', 'Yan ọ̀kan, tàbí "Mi ò dá a lójú". Lẹ́yìn náà sọ fún wa ní èdè tìrẹ.'],
  'r.describe': ['Describe it (English, Yoruba or Pidgin)', 'Ṣàlàyé rẹ̀ (Gẹ̀ẹ́sì, Yorùbá tàbí Pidgin)'],
  'r.photo': ['Add photo', 'Fi àwòrán kún un'],
  'r.samplePhoto': ['Use sample photo', 'Lo àwòrán àpẹẹrẹ'],
  'r.voice': ['Record voice note', 'Gba ohùn sílẹ̀'],
  'r.voice.done': ['Voice note attached', 'A ti so ohùn mọ́ ọn'],
  'r.where': ['Where is it?', 'Níbo ló wà?'],
  'r.where.sub': ['Choose the area. Add a landmark so responders can find it.', 'Yan agbègbè. Fi àmì-ilẹ̀ kún un kí wọ́n lè rí i.'],
  'r.locate': ['Use my location', 'Lo ibi tí mo wà'],
  'r.located': ['Location attached', 'A ti so ibi tí ẹ wà mọ́ ọn'],
  'r.lga': ['Local government', 'Ìjọba ìbílẹ̀'],
  'r.area': ['Area', 'Agbègbè'],
  'r.landmark': ['Near what? (landmark)', 'Nítòsí kí ni? (àmì-ilẹ̀)'],
  'r.who': ['Who are you?', 'Ta ni yín?'],
  'r.who.sub': ['You choose how much we know about you.', 'Ẹ̀yin lẹ máa yan bí a ṣe mọ̀ yín tó.'],
  'id.standard': ['Standard', 'Déédé'],
  'id.standard.sub': ['Government can contact you about this report.', 'Ìjọba lè kàn sí yín nípa ìròyìn yìí.'],
  'id.confidential': ['Confidential', 'Àṣírí'],
  'id.confidential.sub': ['Only specially authorised officers can see who you are.', 'Àwọn òṣìṣẹ́ pàtàkì nìkan ló lè mọ̀ yín.'],
  'id.anonymous': ['Anonymous', 'Láìsí orúkọ'],
  'id.anonymous.sub': ['Your name and number are not stored. Keep your reference number.', 'A kò ní tọ́jú orúkọ tàbí nọ́mbà yín. Ẹ pa nọ́mbà ìtọ́kasí mọ́.'],
  'r.optin': ['Send me SMS updates about this report', 'Fi SMS ránṣẹ́ sí mi nípa ìròyìn yìí'],
  'r.optin.sub': ['For confidential and sensitive reports we do not text you unless you tick this.', 'Fún ìròyìn àṣírí, a kò ní fi SMS ránṣẹ́ àyàfi tí ẹ bá yàn án.'],
  'r.next': ['Next', 'Tẹ̀síwájú'],
  'r.back': ['Back', 'Padà'],
  'r.submit': ['Send report', 'Fi ìròyìn ránṣẹ́'],
  'r.done': ['Report received', 'A ti gba ìròyìn yín'],
  'r.ref': ['Your reference number', 'Nọ́mbà ìtọ́kasí yín'],
  'r.save': ['Save this number. You can track your report with it — no sign-in needed.', 'Ẹ tọ́jú nọ́mbà yìí. Ẹ lè fi tọpinpin ìròyìn yín láìwọlé.'],
  'r.next.title': ['What happens next', 'Kí ló kàn'],
  'r.next.sec': ['A 615 control-room operator reads it now and sends the right unit.', 'Òṣìṣẹ́ yàrá ìṣàkóso 615 máa kà á báyìí, yóò sì rán ẹgbẹ́ tó yẹ.'],
  'r.next.civic': ['It goes to the agency responsible. You will be asked to confirm the fix.', 'Ó máa lọ sí ilé-iṣẹ́ tó ni í. A máa bi yín bóyá wọ́n ti ṣe é.'],
  'r.track': ['Track this report', 'Tọpinpin ìròyìn yìí'],
  'r.new': ['Report something else', 'Ròyìn nǹkan míì'],
  // SOS
  'sos.title': ['Emergency', 'Pàjáwìrì'],
  'sos.what': ['What kind of emergency?', 'Irú pàjáwìrì wo ni?'],
  'sos.where': ['Where are you?', 'Níbo lẹ wà?'],
  'sos.hold': ['Hold for 3 seconds to send SOS', 'Tẹ̀ ẹ́ mú fún ìṣẹ́jú-àáyá mẹ́ta láti fi SOS ránṣẹ́'],
  'sos.holding': ['Keep holding…', 'Ẹ máa tẹ̀ ẹ́ mú…'],
  'sos.or': ['Or press once and confirm', 'Tàbí tẹ̀ ẹ́ lẹ́ẹ̀kan kí ẹ sì fọwọ́ sí i'],
  'sos.confirm': ['Send SOS now', 'Fi SOS ránṣẹ́ báyìí'],
  'sos.cancel': ['Cancel', 'Fagilé'],
  'sos.sent': ['Help is being arranged.', 'A ń ṣètò ìrànlọ́wọ́.'],
  'sos.safe': ['Stay safe. If you can, move away.', 'Ẹ dúró láìléwu. Tí ẹ bá lè ṣe é, ẹ kúrò níbẹ̀.'],
  'sos.call': ['If you can talk, call 615.', 'Tí ẹ bá lè sọ̀rọ̀, ẹ pe 615.'],
  'sos.anon': ['No sign-in. Your name and number are not stored.', 'Kò sí ìwọlé. A kò tọ́jú orúkọ tàbí nọ́mbà yín.'],
  'sos.live': ['Live status', 'Ipò rẹ̀ báyìí'],
  // tracking
  't.title': ['Track a report', 'Tọpinpin ìròyìn kan'],
  't.who': ['Who has it', 'Ta ló ní i'],
  't.secunit': ['A security unit', 'Ẹgbẹ́ ààbò kan'],
  't.control': ['The 615 control room', 'Yàrá ìṣàkóso 615'],
  't.updates': ['Updates', 'Ìròyìn tuntun'],
  't.fixed': ['Is it fixed?', 'Ṣé wọ́n ti ṣe é?'],
  't.yes': ['Yes, fixed', 'Bẹ́ẹ̀ ni, wọ́n ti ṣe é'],
  't.no': ['No', 'Rárá'],
  't.partly': ['Partly', 'Díẹ̀'],
  't.cancel': ['Cancel my report', 'Fagilé ìròyìn mi'],
} as const;

export type StrKey = keyof typeof STRINGS;

export function tr(key: StrKey, lang: Lang = 'en') {
  return STRINGS[key][lang === 'yo' ? 1 : 0];
}

export function useLang(): [Lang, (k: StrKey) => string] {
  const lang = useStore((s) => s.lang);
  return [lang, (k: StrKey) => tr(k, lang)];
}

export function statusLabel(i: Pick<Incident, 'status' | 'verification'>, lang: Lang = 'en') {
  if (i.status === 'closed' && i.verification === 'timeout') return tr('st.closed_unconfirmed', lang);
  return tr(`st.${i.status}` as StrKey, lang);
}

export const catLabel = (c: CategoryId, lang: Lang = 'en') => tr(`cat.${c}` as StrKey, lang);

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

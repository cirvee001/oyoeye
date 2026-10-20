import { useState } from 'react';
import { conduct, dep, feedbackFor, findFocalByPhone, getState, incidentByRef, submitReport } from '../store';
import { statusLabel, ussdText, type Lang } from '../i18n';
import type { CategoryId } from '../platform/types';
import { go } from '../ui';

// A feature-phone USSD session (*615#). Simulated, but it creates real cases
// with channel "ussd" through the same pipeline as every other report.

/** The Rule Book in 4 SMS-length screens (v2.4 §3.1). */
export const USSD_RULES = [
  'OyoEye Rules 1/4\n1 Tell the truth, as you saw it.\n2 SOS is for danger happening now.',
  'OyoEye Rules 2/4\n3 Fake alarms put lives at risk. Honest mistakes are fine.\n4 Your safety comes first.',
  'OyoEye Rules 3/4\n5 No jungle justice.\n6 Describe actions, not tribes.',
  'OyoEye Rules 4/4\n7 Help is free. Never pay.\n8 Respect privacy.',
];
/** DRAFT — needs native-speaker review. The same 4 screens in Yoruba (each fits one SMS screen). */
export const USSD_RULES_YO = [
  'Òfin OyoEye 1/4\n1 Sọ òótọ́, bí ẹ ṣe rí i.\n2 SOS wà fún ewu tó ń ṣẹlẹ̀ báyìí.',
  'Òfin OyoEye 2/4\n3 Ìròyìn èké ń fi ẹ̀mí wewu. Àṣìṣe òtítọ́ kò burú.\n4 Ààbò yín ló ṣáájú.',
  'Òfin OyoEye 3/4\n5 Kò sí ìdájọ́ ọwọ́ ara ẹni.\n6 Ṣàpèjúwe ìwà, kì í ṣe ẹ̀yà.',
  'Òfin OyoEye 4/4\n7 Ìrànlọ́wọ́ jẹ́ ọ̀fẹ́. Ẹ má sanwó.\n8 Bọ̀wọ̀ fún àṣírí ènìyàn.',
];

const PHONE = '0805 555 0199';
const PAGE = 7;

type Screen =
  | { k: 'idle' }
  | { k: 'lang' }
  | { k: 'main' }
  | { k: 'etype' }
  | { k: 'ccat' }
  | { k: 'lga'; page: number }
  | { k: 'area' }
  | { k: 'confirm' }
  | { k: 'track' }
  | { k: 'tracked'; ref: string; id: string }
  | { k: 'rate1'; ref: string; id: string }
  | { k: 'rate2'; ref: string; id: string; money: boolean }
  | { k: 'fphone' }
  | { k: 'rules'; page: number }
  | { k: 'fpin'; phone: string }
  | { k: 'end'; text: string };

const EMERGENCIES: { label: string; yo: string; sub: string }[] = [
  { label: 'Armed persons / shooting', yo: 'Olóhun ìjà / ìbọn', sub: 'armed' },
  { label: 'Kidnapping', yo: 'Ìjínigbé', sub: 'kidnapping' },
  { label: 'Robbery / break-in', yo: 'Olè jíjà / fífọ́ ilé', sub: 'robbery' },
  { label: 'Fight / cult clash', yo: 'Ìjà / ìjà ẹgbẹ́ òkùnkùn', sub: 'violence' },
  { label: 'Fire', yo: 'Iná', sub: 'fire' },
  { label: 'Other emergency', yo: 'Pàjáwìrì míì', sub: 'sos' },
];
const PROBLEMS: { label: string; yo: string; cat: CategoryId }[] = [
  { label: 'Road', yo: 'Ọ̀nà', cat: 'roads' },
  { label: 'Waste / refuse', yo: 'Pàǹtí', cat: 'waste' },
  { label: 'Flooding / drainage', yo: 'Ìkún omi / ọ̀gbàrá', cat: 'flooding' },
  { label: 'Light / water / pole', yo: 'Iná mànàmáná / omi / òpó', cat: 'infrastructure' },
  { label: 'Other', yo: 'Òmíràn', cat: 'other' },
];

export function Ussd() {
  const [screen, setScreen] = useState<Screen>({ k: 'idle' });
  const [input, setInput] = useState('');
  // v2.5: the first screen offers English or Yorùbá; the whole session follows the choice.
  const [lang, setLangU] = useState<Lang>('en');
  const u = (k: Parameters<typeof ussdText>[0], p?: Record<string, string>) => ussdText(k, lang, p);
  const rules = lang === 'yo' ? USSD_RULES_YO : USSD_RULES;
  const lbl = (x: { label: string; yo: string }) => (lang === 'yo' ? x.yo : x.label);
  const [draft, setDraft] = useState<{ mode: 'e' | 'p'; label: string; sub?: string; cat?: CategoryId; lgaId?: string; area?: string; focalId?: string }>({ mode: 'e', label: '' });
  const lgas = dep.lgas;

  const text = (): string => {
    switch (screen.k) {
      case 'idle':
        return 'Dial *615# and press Call';
      case 'lang':
        return u('lang');
      case 'main':
        return u('main');
      case 'etype':
        return `${u('emergency')}\n` + EMERGENCIES.map((e, k) => `${k + 1} ${lbl(e)}`).join('\n') + `\n${u('back')}`;
      case 'ccat':
        return `${u('problem')}\n` + PROBLEMS.map((e, k) => `${k + 1} ${lbl(e)}`).join('\n') + `\n${u('back')}`;
      case 'lga': {
        const items = lgas.slice(screen.page * PAGE, screen.page * PAGE + PAGE);
        const more = (screen.page + 1) * PAGE < lgas.length;
        return `${u('lga')}\n` + items.map((l, k) => `${k + 1} ${l.name}`).join('\n') + (more ? `\n${u('more')}` : '') + `\n${u('back')}`;
      }
      case 'area': {
        const l = lgas.find((x) => x.id === draft.lgaId)!;
        return `${u('area', { lga: l.name })}\n` + l.areas.map((a, k) => `${k + 1} ${a}`).join('\n') + `\n${u('back')}`;
      }
      case 'confirm':
        return `${draft.label}\n${draft.area}, ${lgas.find((x) => x.id === draft.lgaId)?.name}\n${u('send')}`;
      case 'track':
        return u('track');
      case 'tracked': {
        const i = getState().incidents.find((x) => x.id === screen.id);
        const closed = i && (i.status === 'closed' || i.status === 'referred');
        return `${screen.ref}\n${u('status')} ${i ? statusLabel(i, lang) : '—'}${closed && !feedbackFor(getState(), screen.ref) ? `\n${u('rate')}` : ''}\n${u('exit')}`;
      }
      case 'rate1':
        return u('rate1');
      case 'rate2':
        return u('rate2');
      case 'fphone':
        return u('fphone');
      case 'rules':
        return `${rules[screen.page]}\n${screen.page < rules.length - 1 ? `${u('next')}\n` : ''}${u('exit')}`;
      case 'fpin':
        return u('fpin');
      case 'end':
        return screen.text;
    }
  };

  const send = () => {
    const v = input.trim();
    setInput('');
    switch (screen.k) {
      case 'idle':
        if (v.replace(/\s/g, '') === '*615#') setScreen({ k: 'lang' });
        else setScreen({ k: 'end', text: 'Invalid MMI code.\nDial *615#' });
        return;
      case 'lang':
        if (v !== '1' && v !== '2') return;
        setLangU(v === '2' ? 'yo' : 'en');
        return setScreen({ k: 'main' });
      case 'main':
        if (v === '1') return (setDraft({ mode: 'e', label: '' }), setScreen({ k: 'etype' }));
        if (v === '2') return (setDraft({ mode: 'p', label: '' }), setScreen({ k: 'ccat' }));
        if (v === '3') return setScreen({ k: 'track' });
        if (v === '4') return setScreen({ k: 'fphone' });
        if (v === '5') return setScreen({ k: 'rules', page: 0 });
        return;
      case 'etype': {
        if (v === '0') return setScreen({ k: 'main' });
        const e = EMERGENCIES[Number(v) - 1];
        if (!e) return;
        setDraft({ ...draft, mode: 'e', label: lbl(e), sub: e.sub });
        return setScreen({ k: 'lga', page: 0 });
      }
      case 'ccat': {
        if (v === '0') return setScreen({ k: 'main' });
        const p = PROBLEMS[Number(v) - 1];
        if (!p) return;
        setDraft({ mode: 'p', label: lbl(p), cat: p.cat });
        return setScreen({ k: 'lga', page: 0 });
      }
      case 'lga': {
        if (v === '0') return setScreen(screen.page ? { k: 'lga', page: screen.page - 1 } : { k: draft.mode === 'e' ? 'etype' : 'ccat' });
        if (v === '9' && (screen.page + 1) * PAGE < lgas.length) return setScreen({ k: 'lga', page: screen.page + 1 });
        const l = lgas[screen.page * PAGE + Number(v) - 1];
        if (!l || Number(v) < 1 || Number(v) > PAGE) return;
        setDraft({ ...draft, lgaId: l.id });
        return setScreen({ k: 'area' });
      }
      case 'area': {
        if (v === '0') return setScreen({ k: 'lga', page: 0 });
        const l = lgas.find((x) => x.id === draft.lgaId)!;
        const a = l.areas[Number(v) - 1];
        if (!a) return;
        setDraft({ ...draft, area: a });
        return setScreen({ k: 'confirm' });
      }
      case 'confirm': {
        if (v === '2') return setScreen({ k: 'end', text: u('cancelled') });
        if (v !== '1') return;
        const fire = draft.sub === 'fire';
        const res = submitReport(
          draft.mode === 'e'
            ? {
                text: `USSD emergency: ${EMERGENCIES.find((e) => e.sub === draft.sub)?.label ?? draft.label} at ${draft.area}`,
                category: fire ? 'fire' : 'security',
                subcategory: fire ? 'building' : draft.sub,
                sos: !fire && draft.sub === 'sos',
                lgaId: draft.lgaId!,
                area: draft.area!,
                identity: 'standard',
                channel: 'ussd',
                reporter: draft.focalId ? { personId: draft.focalId, name: dep.people.find((x) => x.id === draft.focalId)?.name, phone: dep.people.find((x) => x.id === draft.focalId)?.phone } : { phone: PHONE },
                focal: draft.focalId ? { how: 'saw' } : undefined,
                lang,
              }
            : { text: `USSD report: ${PROBLEMS.find((p) => p.cat === draft.cat)?.label ?? draft.label} problem at ${draft.area}`, category: draft.cat === 'other' ? undefined : draft.cat, lgaId: draft.lgaId!, area: draft.area!, identity: 'standard', channel: 'ussd', reporter: { phone: PHONE }, lang },
        );
        return setScreen({ k: 'end', text: u(draft.mode === 'e' ? 'sentE' : 'sentP', { ref: res.ref }) });
      }
      case 'fphone':
        return setScreen({ k: 'fpin', phone: v });
      case 'rules':
        if (v === '1' && screen.page < rules.length - 1) return setScreen({ k: 'rules', page: screen.page + 1 });
        return setScreen({ k: 'end', text: u('rulesEnd') });
      case 'fpin': {
        const f = findFocalByPhone(screen.phone);
        if (!f || f.staffStatus !== 'active' || v !== (f.pin ?? '1234')) return setScreen({ k: 'end', text: u('badpin') });
        setDraft({ mode: 'e', label: '', focalId: f.id });
        return setScreen({ k: 'etype' });
      }
      case 'tracked':
        if (v === '1') return setScreen({ k: 'rate1', ref: screen.ref, id: screen.id });
        return setScreen({ k: 'end', text: u('thanks') });
      case 'rate1':
        if (v !== '1' && v !== '2') return;
        return setScreen({ k: 'rate2', ref: screen.ref, id: screen.id, money: v === '1' });
      case 'rate2': {
        const respect = v === '1' ? 'yes' : v === '2' ? 'somewhat' : v === '3' ? 'no' : undefined;
        if (!respect) return;
        const err = conduct.answer(screen.id, screen.ref, { money: screen.money, respect }, 'ussd');
        return setScreen({ k: 'end', text: err ?? u('rated') });
      }
      case 'track': {
        const i = incidentByRef(v);
        if (i) return setScreen({ k: 'tracked', ref: i.reports.find((r) => r.ref === v.trim().toUpperCase())?.ref ?? i.ref, id: i.id });
        return setScreen({ k: 'end', text: u('notfound') });
      }
      case 'end':
        setLangU('en');
        return setScreen({ k: 'idle' });
    }
  };

  return (
    <div className="ussd-page">
      <div className="page-head">
        <div>
          <h1>USSD *615# simulator</h1>
          <p>Not everyone has a smartphone. Any phone can dial *615# — no data, no app. Cases land in the same control-room board.</p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => history.back()}>
          Back
        </button>
      </div>
      <div className="featurephone">
        <div className="fp-top">
          <span>MTN NG</span>
          <span>▮▮▮▯ 12:00</span>
        </div>
        <pre className="fp-screen" aria-live="polite" lang={lang}>
          {text()}
        </pre>
        <form
          className="fp-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={screen.k === 'idle' ? '*615#' : screen.k === 'end' ? '' : 'Reply'} autoFocus aria-label="USSD input" />
          <button className="btn primary">{screen.k === 'idle' ? 'Call' : screen.k === 'end' ? 'OK' : 'Send'}</button>
        </form>
        <div className="fp-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
            <button key={k} type="button" onClick={() => setInput((x) => x + k)} aria-label={`Key ${k}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn sm ghost" type="button" onClick={() => (setScreen({ k: 'idle' }), setInput(''))}>
            Hang up
          </button>
        </div>
      </div>
      <p className="small muted center">
        Simulated handset {PHONE}. Kidnapping and other sensitive reports are kept confidential and get <b>no SMS back</b>.{' '}
        <a href="#/" onClick={(e) => (e.preventDefault(), go(''))}>
          Done
        </a>
      </p>
    </div>
  );
}

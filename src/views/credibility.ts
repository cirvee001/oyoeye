import { samePhone } from '../format';
import { MIN, distinctReporters, km } from '../platform/engine';
import type { Incident } from '../platform/types';
import { FOCAL_GROUPS as FOCAL_LABEL, getState, person, standingOfReport } from '../store';

/** Signals shown to the operator. They inform a person; they never decide. */
export function credibility(i: Incident, all: Incident[]) {
  const out: { tone: 'good' | 'warn' | 'bad' | ''; text: string }[] = [];
  const n = distinctReporters(i);
  out.push(n > 1 ? { tone: 'good', text: `Reported by ${n} people within ${Math.round((Math.max(...i.reports.map((r) => r.submittedAt)) - i.createdAt) / MIN)} min` } : { tone: '', text: i.reports.length > 1 ? `${i.reports.length} reports but from the same source — counts as a single report` : 'Single report' });
  const near = all.filter((x) => x.id !== i.id && x.category === 'security' && Math.abs(x.createdAt - i.createdAt) < 72 * 60 * MIN && km(x.lat, x.lng, i.lat, i.lng) < 2);
  if (near.length) out.push({ tone: 'warn', text: `${near.length} other security reports within 2 km in 72h` });
  const r = i.reports[0];
  // v2.3: registered community focal persons are a strong signal (still verified by a person).
  const fp = person(r.reporter?.personId);
  if (fp?.role === 'focal' && fp.verified && (fp.staffStatus ?? 'active') === 'active') {
    const h = fp.history ?? { reports: 0, confirmed: 0, false: 0 };
    out.unshift({ tone: 'good', text: `Registered focal person — ${FOCAL_LABEL[fp.focalGroup ?? 'youth']}, ${fp.community} · ${h.confirmed} of ${h.reports} past reports confirmed` });
    if (r.focal) {
      out.push({ tone: 'good', text: `How they know: ${r.focal.how === 'at_scene' ? 'group members are at the scene' : r.focal.how === 'saw' ? 'saw it themselves' : 'someone in the community told them'}${r.focal.atRisk ? ` · ${r.focal.atRisk} people at risk` : ''}` });
      if (r.focal.canAssist) out.push({ tone: 'warn', text: 'Their group offers to assist — the operator decides; never dispatch civilians' });
    }
  }
  // v2.4: reporter standing (only duty-lead-confirmed hoaxes in the last 12 months count).
  const sd = standingOfReport(getState(), i);
  if (sd && !i.officerSos) {
    if (sd.level === 'restricted') out.unshift({ tone: 'bad', text: `⛔ Restricted reporter — call back before verifying (${sd.hoaxes.length} hoaxes in 12 months)${i.callback ? ` · call-back: ${i.callback.result === 'reached' ? 'reached' : "couldn't reach"}` : ''}` });
    else if (sd.level === 'review') out.push({ tone: 'warn', text: '⚠ Reporter standing: Under review (1 deliberate false alarm in 12 months) — normal handling' });
    else if (sd.level === 'trusted') out.push({ tone: 'good', text: `★ Reporter standing: Trusted — ${sd.confirmed} of ${sd.closed} reports confirmed` });
    else out.push({ tone: '', text: `Reporter standing: ${sd.label}` });
  }
  if (i.officerSos) out.unshift({ tone: 'good', text: 'Officer SOS from a verified, signed-in officer — an alert, not an allegation' });
  if (r.identity === 'anonymous') out.push({ tone: '', text: 'Anonymous — no call-back possible' });
  const p = person(r.reporter?.personId);
  if (p?.history && r.identity === 'standard') {
    const h = p.history;
    out.push(h.false >= 2 ? { tone: 'bad', text: `Reporter history: ${h.false} of ${h.reports} past reports were false` } : { tone: 'good', text: `Reporter history: ${h.confirmed} of ${h.reports} past reports confirmed` });
  } else if (r.identity === 'confidential') out.push({ tone: '', text: 'Confidential reporter — history held by restricted desk' });
  const phone = r.reporter?.phone;
  if (phone) {
    const recent = all.flatMap((x) => x.reports).filter((x) => samePhone(x.reporter?.phone, phone) && Math.abs(x.submittedAt - r.submittedAt) < 60 * MIN).length;
    if (recent > 2) out.push({ tone: 'bad', text: `Rate limit: ${recent} reports from this number in 1h` });
  }
  if (r.photo) out.push({ tone: 'good', text: 'Photo attached' });
  if (r.channel === 'sos') out.push({ tone: 'warn', text: 'SOS button — person may be in danger now' });
  if (r.channel === 'ussd') out.push({ tone: '', text: 'USSD from a feature phone — short text only' });
  if (r.channel === 'call_615') out.push({ tone: 'good', text: `Spoke to operator${r.callRef ? ` (${r.callRef})` : ''}` });
  return out;
}

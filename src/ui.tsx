import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MIN, clockState, dur, isOpen, isOverdue, pendingHandoff } from './platform/engine';
import type { CategoryId, Incident, Severity } from './platform/types';
import { STATUS_COLOR, STATUS_ORDER, STATUS_TONE, statusLabel, tr, type Lang } from './i18n';
import { agency, cat, dep, handoffTarget, holderLabel, levelLabel, lgaOf, now, stepOf, subLabel } from './store';
import { readPhoto } from './photo';
import {
  ArrowRightLeft, Bell, Building2, Download, KeyRound, Megaphone, MessageCircle, Paperclip, Pin, SendHorizontal, Upload, CalendarClock, Camera, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleHelp, Clock as ClockIcon, Construction, Ellipsis, FileText, Flame, House, Inbox as InboxIcon, LayoutDashboard, ListChecks, ListFilter, LogOut, MapPin, Menu, Mic, PhoneCall, Plus, Route, ScrollText, Search, Shield, Siren, Timer, Trash2, TriangleAlert, User, Users, Waves, X, Zap, type LucideIcon,
} from 'lucide-react';

export function useNow(ms = 15_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now();
}

export const go = (path: string) => (location.hash = path);
export const hhmm = (t?: number) => (t ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
export const dayTime = (t: number) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const ago = (t: number, at = now()) => {
  const m = Math.round((at - t) / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m ago`;
  return `${Math.floor(m / 1440)}d ago`;
};
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export const SEV_COLOR: Record<Severity, string> = { critical: 'var(--crit)', high: 'var(--high)', normal: 'var(--normal)', low: 'var(--low)' };

export function Sev({ s }: { s: Severity }) {
  return <span className={`badge ${s}`}>{s[0].toUpperCase() + s.slice(1)}</span>;
}

// ---------- status ----------

export function StatusPill({ i, lang = 'en', big }: { i: Pick<Incident, 'status' | 'verification'>; lang?: Lang; big?: boolean }) {
  return (
    <span className={`pill ${STATUS_TONE[i.status]}${big ? ' big' : ''}`}>{statusLabel(i, lang)}</span>
  );
}

/** Priority: small dot + word. Red only for critical. */
export function Priority({ s }: { s: Severity }) {
  return (
    <span className={`prio p-${s}`}>
      <span className="pdot" />
      {s[0].toUpperCase() + s.slice(1)}
    </span>
  );
}

export const isSos = (i: Incident) => i.reports[0]?.channel === 'sos' || i.subcategory === 'sos';

/** The single most urgent flag for a table row (SOS > Overdue > Handoff pending). */
export function TopFlag({ i, at }: { i: Incident; at: number }) {
  if (i.officerSos && isOpen(i)) return <span className="badge solid pulse">OFFICER SOS</span>;
  if (i.lone && isOpen(i) && i.t.onScene && i.lone.nextDue) {
    const left = Math.round((i.lone.nextDue - at) / MIN);
    return <span className={`badge ${left <= 0 ? 'bad' : 'info'}`}>{left > 0 ? `Alone on scene · ${left}m` : 'Alone · check-in due'}</span>;
  }
  if (isSos(i) && isOpen(i)) return <span className={`badge solid${i.status === 'pending' ? ' pulse' : ''}`}>SOS</span>;
  if (isOverdue(i, at)) return <span className="badge bad">Overdue</span>;
  const h = pendingHandoff(i);
  if (h) return <span className="badge handoff">Handoff pending</span>;
  return null;
}

/** HospEase-style stat card: tinted icon circle, grey label, big number. */
export function StatCard({ icon, label, value, sub, tone = 'green', onClick }: { icon: string; label: string; value: ReactNode; sub?: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'grey'; onClick?: () => void }) {
  return (
    <div className={`statcard${onClick ? ' click' : ''}`} onClick={onClick}>
      <span className={`sc-ico t-${tone}`}>
        <Icon name={icon} size={20} />
      </span>
      <div className="sc-label">{label}</div>
      <div className="sc-value">{value}</div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  );
}

/** Underline tabs with count chips (HospEase Tabs). */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="utabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="chip-n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** "Cases" card title with a count badge, like HospEase "Patients 12". */
export function CountTitle({ title, n }: { title: string; n: number }) {
  return (
    <span className="count-title">
      {title} <span className="count-badge">{n}</span>
    </span>
  );
}

/** Flags are badges, not statuses. */
export function Flags({ i, at, safe }: { i: Incident; at: number; safe?: boolean }) {
  const h = pendingHandoff(i);
  const out: ReactNode[] = [];
  if (isSos(i)) out.push(<span key="sos" className={`badge solid${i.status === 'pending' ? ' pulse' : ''}`}>SOS</span>);
  if (safe) return <>{out}</>;
  if (h) out.push(<span key="h" className="badge handoff">Handoff pending → {handoffTarget(h)}</span>);
  if (i.escalationLevel >= 2 && isOpen(i)) out.push(<span key="e" className={`badge ${i.escalationLevel >= 4 ? 'bad' : 'warn'}`}>Escalated L{i.escalationLevel} · {levelLabel(i)}</span>);
  if (isOverdue(i, at)) out.push(<span key="o" className="badge bad">Overdue</span>);
  if (i.restricted && i.unverified && isOpen(i)) out.push(<span key="u" className="badge">Uncorroborated</span>);
  if (i.backupRequested && isOpen(i)) out.push(<span key="b" className="badge bad">Backup requested</span>);
  if (i.backupSent && isOpen(i)) out.push(<span key="bs" className="badge info">Backup: {i.backupSent}</span>);
  return <>{out}</>;
}

export function IdBadge({ i }: { i: Incident }) {
  const ids = new Set(i.reports.map((r) => r.identity));
  if (i.sensitiveOnly) return <span className="badge sealed">Restricted desk</span>;
  if (ids.has('confidential')) return <span className="badge sealed">Confidential</span>;
  if (ids.has('anonymous') && ids.size === 1) return <span className="badge">Anonymous</span>;
  return null;
}

const STEP_KEYS = ['', 'verified', 'assigned', 'accepted', 'started', 'resolved', 'closed'] as const;

function stepTime(i: Incident, k: number): number | undefined {
  switch (k) {
    case 0:
      return i.createdAt;
    case 1:
      return i.t.verified ?? (stepOf(i) >= 1 ? i.handoffs[0]?.at : undefined);
    case 2:
      return i.t.assigned;
    case 3:
      return i.t.acknowledged;
    case 4:
      return i.t.started;
    case 5:
      return i.t.resolved;
    case 6:
      return i.t.closed;
  }
}

/** Plain-language who-did-it for a step. "safe" hides people and units on security cases. */
function stepWho(i: Incident, k: number, safe: boolean, lang: Lang): string | undefined {
  if (k === 0) return `via ${CHANNEL[i.reports[0]?.channel] ?? 'web'}`;
  if (k === 1 && !i.t.verified) return 'Auto-checked';
  if (safe) {
    if (k === 1) return i.restricted ? tr('t.control', lang) : 'Checked';
    if (k >= 2 && k <= 5) return i.restricted ? tr('t.secunit', lang) : agency(i.agencyId)?.short;
    return undefined;
  }
  if (k === 4) return i.by.started;
  const key = STEP_KEYS[k];
  return key ? i.by[key as keyof Incident['by']] : undefined;
}

export function Stepper({ i, compact, safe = false, lang = 'en' }: { i: Incident; compact?: boolean; safe?: boolean; lang?: Lang }) {
  const cur = stepOf(i);
  const final = i.status === 'closed' || i.status === 'referred';
  const sub = i.status === 'in_progress' ? (i.t.onScene ? 'On scene' : i.t.enRoute ? 'En route' : 'Working') : undefined;
  const side = i.side && (i.status === i.side.kind || i.side.kind === 'reopened') ? i.side : undefined;
  return (
    <ol className={`stepper${compact ? ' compact' : ''}`} aria-label="Case progress">
      {STATUS_ORDER.map((st, k) => {
        const done = k < cur || (k === cur && (final || i.status === 'rejected'));
        const now = k === cur && isOpen(i);
        const t = k <= cur ? stepTime(i, k) : undefined;
        const marker = side && side.step === k ? side : undefined;
        const struck = i.status === 'rejected' && k > cur;
        const label = k === 6 && i.status === 'referred' ? statusLabel({ status: 'referred' }, lang) : k === 4 && sub && now ? `${statusLabel({ status: st }, lang)} · ${sub}` : statusLabel({ status: st, verification: k === 6 ? i.verification : undefined }, lang);
        return (
          <li key={st} className={`step${done ? ' done' : ''}${now ? ' now' : ''}${struck ? ' struck' : ''}${k === 6 && i.status === 'referred' ? ' referred' : ''}`} style={{ ['--c' as string]: STATUS_COLOR[st] }}>
            <span className="dot" />
            <span className="lbl">{label}</span>
            {!compact && t && (
              <span className="meta">
                {hhmm(t)}
                {stepWho(i, k, safe, lang) ? ` · ${stepWho(i, k, safe, lang)}` : ''}
              </span>
            )}
            {marker && (
              <span className={`side ${marker.kind}`} title={marker.reason}>
                {statusLabel({ status: marker.kind }, lang)} · {hhmm(marker.at)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- clocks ----------

/** The clock that matters right now for this case. */
export function nextClock(i: Incident, at: number) {
  if (!isOpen(i)) {
    const total = (i.t.resolved ?? i.t.closed ?? at) - i.createdAt;
    return { label: i.status === 'resolved' ? 'Done in' : 'Took', value: dur(total), tone: i.t.resolved && i.t.resolved > i.resolveDueAt ? 'bad' : 'good' };
  }
  const pick = (label: string, due: number, from: number) => {
    const st = clockState(due, undefined, at, due - from);
    return { label, value: at > due ? `${dur(at - due)} over` : `${dur(due - at)} left`, tone: st === 'breached' ? 'bad' : st === 'due_soon' ? 'warn' : 'good' };
  };
  if (!i.t.acknowledged) return pick(i.status === 'pending' ? 'Review' : 'Accept', i.ackDueAt, i.t.assigned ?? i.createdAt);
  if (i.arriveDueAt && !i.t.onScene) return pick('Arrive', i.arriveDueAt, i.createdAt);
  return pick('Resolve', i.resolveDueAt, i.createdAt);
}

export function Clock({ i, at }: { i: Incident; at: number }) {
  const c = nextClock(i, at);
  return (
    <span className={`badge clock ${c.tone}`} title={`${c.label} target`}>
      {c.label}: {c.value}
    </span>
  );
}

/** green / amber / red for one SLA clock. */
export function ClockRow({ label, due, done, from, at }: { label: string; due?: number; done?: number; from: number; at: number }) {
  if (!due) return null;
  const st = clockState(due, done, at, due - from);
  const tone = st === 'met' || st === 'ok' ? 'good' : st === 'due_soon' ? 'warn' : 'bad';
  const text = done ? `${st === 'met' ? 'met' : 'missed'} · ${hhmm(done)}` : at > due ? `${dur(at - due)} overdue` : `${dur(due - at)} left · by ${hhmm(due)}`;
  return (
    <div className="clockrow">
      <span className={`light ${tone}`} />
      <span>{label}</span>
      <span className="tnum muted">{text}</span>
    </div>
  );
}

export const CHANNEL: Record<string, string> = { web: 'App / web', sos: 'SOS', whatsapp: 'WhatsApp', sms: 'SMS', ussd: 'USSD', call_615: '615 call' };

// ---------- layout primitives ----------

export function Stat({ k, v, s, alert, onClick }: { k: string; v: ReactNode; s?: ReactNode; alert?: boolean; onClick?: () => void }) {
  return (
    <div className={`stat${alert ? ' alert' : ''}${onClick ? ' click' : ''}`} onClick={onClick}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

export function Bars({ rows, max, color }: { rows: { label: ReactNode; n: number; hint?: string; color?: string }[]; max?: number; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <div className="empty">Nothing yet</div>;
  return (
    <div className="bars">
      {rows.map((r, k) => (
        <div className="bar" key={k} title={r.hint}>
          <span>{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(r.n / m) * 100}%`, background: r.color ?? color }} />
          </div>
          <span className="n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, right, children, pad = true, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="hd">
          <h2>{title}</h2>
          <div className="spacer" />
          {right}
        </div>
      )}
      {pad ? <div className="bd">{children}</div> : children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** HospEase-style work-list table: grey header, row dividers, View button, 10 per page. */
export function CaseTable({ rows, at, empty = 'No cases here. New cases appear here and in your inbox.', pageSize = 10, showWho = true }: { rows: Incident[]; at: number; empty?: string; pageSize?: number; showWho?: boolean }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = rows.slice(p * pageSize, p * pageSize + pageSize);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="htable">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>What</th>
              <th>Where</th>
              <th>Reported</th>
              {showWho && <th>With</th>}
              <th>Status</th>
              <th>Priority</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} className="click" onClick={() => go(`/case/${i.id}`)}>
                <td className="mono">{i.ref}</td>
                <td>
                  <div className="row nowrap" style={{ gap: 8 }}>
                    <CatIcon c={i.category} size={15} />
                    <span className="strong">{subLabel(i.category, i.subcategory)}</span>
                    <TopFlag i={i} at={at} />
                  </div>
                </td>
                <td>
                  {i.area}
                  <div className="tiny muted">{lgaOf(i.lgaId).name}</div>
                </td>
                <td className="muted nowrap">{ago(i.createdAt, at)}</td>
                {showWho && <td className="small">{holderLabel(i)}</td>}
                <td>
                  <StatusPill i={i} />
                </td>
                <td>
                  <Priority s={i.severity} />
                </td>
                <td>
                  <button
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      go(`/case/${i.id}`);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="pager">
          <span className="small muted">
            Showing {p * pageSize + 1}–{Math.min(rows.length, (p + 1) * pageSize)} of {rows.length}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" disabled={p === 0} onClick={() => setPage(p - 1)}>
              <Icon name="back" size={16} /> Previous
            </button>
            <span className="small">
              Page {p + 1} of {pages}
            </span>
            <button className="btn sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
              Next <Icon name="forward" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- toasts ----------

type ToastT = { id: number; text: string; tone: 'good' | 'bad' | 'info' };
let toasts: ToastT[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;
export function toast(text: string, tone: ToastT['tone'] = 'good') {
  const t = { id: ++toastId, text, tone };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, 4500);
}
/** Run an action; show the error as a toast, or the success message. Returns true on success. */
export function run(err: string | undefined, ok?: string) {
  if (err) {
    toast(err, 'bad');
    return false;
  }
  if (ok) toast(ok);
  return true;
}
export function Toaster() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((x) => x + 1);
    toastListeners.add(l);
    return () => void toastListeners.delete(l);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- sheets & confirm ----------

export function Sheet({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="sheet-hd">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-bd">{children}</div>
      </div>
    </div>
  );
}

/** Two-step button for irreversible actions (Reject, Close). */
export function ConfirmButton({ children, confirm, onConfirm, className = 'btn', disabled }: { children: ReactNode; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button className={className} disabled={disabled} onClick={() => setAsk(true)}>
        {children}
      </button>
    );
  return (
    <div className="confirm">
      <span className="small">{confirm}</span>
      <button
        className="btn danger sm"
        onClick={() => {
          setAsk(false);
          onConfirm();
        }}
      >
        Yes, confirm
      </button>
      <button className="btn sm" onClick={() => setAsk(false)}>
        Cancel
      </button>
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[] | T[]; value?: string; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={`chip${value === o ? ' on' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ---------- photos ----------

/** A generated stand-in photo so the demo works without a real image file. */
export function samplePhoto(label: string, tone = '#6b7a52') {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 320;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 320);
  sky.addColorStop(0, '#cfe0ea');
  sky.addColorStop(1, '#e9e3d4');
  g.fillStyle = sky;
  g.fillRect(0, 0, 480, 320);
  g.fillStyle = '#9c8f7a';
  g.fillRect(0, 210, 480, 110);
  g.fillStyle = '#b9ad98';
  g.fillRect(40, 120, 120, 90);
  g.fillRect(300, 100, 140, 110);
  g.fillStyle = tone;
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.ellipse(150 + k * 22, 240 + (k % 3) * 8, 34, 16, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 286, 480, 34);
  g.fillStyle = '#fff';
  g.font = '600 16px system-ui, sans-serif';
  g.fillText(`${label} · ${new Date(now()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, 12, 309);
  return c.toDataURL('image/jpeg', 0.7);
}

export function PhotoInput({ value, onChange, label = 'Photo', sample = 'Sample photo', sampleTone }: { value?: string; onChange: (v?: string) => void; label?: string; sample?: string; sampleTone?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        {value && <img className="thumb" src={value} alt="Attached" />}
        <button type="button" className="btn" onClick={() => ref.current?.click()}>
          <Icon name="camera" /> {value ? 'Change photo' : 'Take / choose photo'}
        </button>
        <button type="button" className="btn ghost" onClick={() => onChange(samplePhoto(sample, sampleTone))}>
          Use sample photo
        </button>
        {value && (
          <button type="button" className="btn ghost sm" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
        <input
          ref={ref}
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            onChange(f ? await readPhoto(f) : undefined);
          }}
        />
      </div>
    </div>
  );
}

// ---------- icons (lucide-react, the same set HospEase uses) ----------

const ICONS: Record<string, LucideIcon> = {
  security: Shield,
  fire: Flame,
  flooding: Waves,
  roads: Construction,
  waste: Trash2,
  infrastructure: Zap,
  other: CircleHelp,
  bell: Bell,
  camera: Camera,
  mic: Mic,
  pin: MapPin,
  phone: PhoneCall,
  list: ListChecks,
  plus: Plus,
  check: Check,
  pass: ArrowRightLeft,
  user: User,
  overview: LayoutDashboard,
  cases: ListChecks,
  inbox: InboxIcon,
  call: PhoneCall,
  reports: ChartColumn,
  officers: Users,
  logout: LogOut,
  search: Search,
  menu: Menu,
  x: X,
  back: ChevronLeft,
  forward: ChevronRight,
  down: ChevronDown,
  more: Ellipsis,
  filter: ListFilter,
  home: House,
  routing: Route,
  sla: Timer,
  duty: CalendarClock,
  audit: ScrollText,
  sos: Siren,
  clock: ClockIcon,
  alert: TriangleAlert,
  done: CircleCheck,
  file: FileText,
  doc: FileText,
  chat: MessageCircle,
  station: Building2,
  send: SendHorizontal,
  clip: Paperclip,
  pinned: Pin,
  urgent: Megaphone,
  upload: Upload,
  download: Download,
  key: KeyRound,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const C = ICONS[name] ?? CircleHelp;
  return <C className="ico" size={size} strokeWidth={1.9} aria-hidden />;
}

export function CatIcon({ c, size = 22 }: { c: CategoryId; size?: number }) {
  return (
    <span className={`caticon c-${c}`} style={{ width: size + 10, height: size + 10 }}>
      <Icon name={c} size={size} />
    </span>
  );
}

// ---------- map ----------

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  r?: number;
  title: string;
  pulse?: boolean;
  onClick?: () => void;
}

function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function MapView({ points, metro: metroDefault = false, height = 380, labels = true, toggle = true }: { points: MapPoint[]; metro?: boolean; height?: number; labels?: boolean; toggle?: boolean }) {
  const [metro, setMetro] = useState(metroDefault);
  const b = metro ? dep.metroBounds : dep.bounds;
  const W = 600;
  const H = Math.round((W * (b.maxLat - b.minLat)) / (b.maxLng - b.minLng));
  const x = (lng: number) => ((lng - b.minLng) / (b.maxLng - b.minLng)) * W;
  const y = (lat: number) => ((b.maxLat - lat) / (b.maxLat - b.minLat)) * H;
  const shape = useMemo(() => {
    // Schematic outline around LGA centres (not a survey boundary).
    const ring: [number, number][] = [];
    for (const l of dep.lgas) for (let a = 0; a < 8; a++) ring.push([l.lng + Math.cos((a * Math.PI) / 4) * 0.16, l.lat + Math.sin((a * Math.PI) / 4) * 0.16]);
    return hull(ring);
  }, []);
  const visible = points.filter((p) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng);
  const scale = metro ? 1.25 : 1;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {toggle && (
        <div className="row between">
          <div className="seg">
            <button className={!metro ? 'on' : ''} onClick={() => setMetro(false)}>
              State
            </button>
            <button className={metro ? 'on' : ''} onClick={() => setMetro(true)}>
              Ibadan metro
            </button>
          </div>
          <span className="tiny muted">{visible.length} shown · schematic map</span>
        </div>
      )}
      <svg className="map" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: height }} role="img" aria-label="Incident map">
        <polygon className="shape" points={shape.map(([lng, lat]) => `${x(lng)},${y(lat)}`).join(' ')} />
        {dep.lgas.map((l) => (
          <g key={l.id}>
            <circle className="lga-dot" cx={x(l.lng)} cy={y(l.lat)} r={2} />
            {labels && (metro ? l.metro : !l.metro || l.id === 'ibn') && (
              <text className="lga-label" x={x(l.lng) + 5} y={y(l.lat) - 4}>
                {metro ? l.name : l.id === 'ibn' ? 'Ibadan' : l.name}
              </text>
            )}
          </g>
        ))}
        {visible.map((p) => (
          <circle key={p.id} className={`pt${p.pulse ? ' pulse' : ''}`} cx={x(p.lng)} cy={y(p.lat)} r={(p.r ?? 4) * scale} fill={p.color} fillOpacity={0.85} onClick={p.onClick}>
            <title>{p.title}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function incidentPoints(rows: Incident[], at: number): MapPoint[] {
  return rows.map((i) => ({
    id: i.id,
    lat: i.lat,
    lng: i.lng,
    color: SEV_COLOR[i.severity],
    r: 3.5 + Math.min(6, Math.sqrt(i.reports.length) * 1.4),
    title: `${i.ref} · ${subLabel(i.category, i.subcategory)} · ${i.area}${isOverdue(i, at) ? ' · OVERDUE' : ''}`,
    pulse: i.status === 'pending' && i.severity === 'critical',
    onClick: () => go(`/case/${i.id}`),
  }));
}

export { cat };

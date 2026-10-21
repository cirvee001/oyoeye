// Nigerian formats (PRD v2.6 §2): one set of helpers, always in Oyo time (Africa/Lagos, WAT),
// whatever time zone the presenter's laptop is set to. No other code formats dates itself.

export const TZ = 'Africa/Lagos';
/** WAT is UTC+1 all year (no daylight saving). */
const WAT_OFFSET = 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const parts = (opts: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
  return (t: number) => Object.fromEntries(f.formatToParts(t).map((p) => [p.type, p.value])) as Record<string, string>;
};
const timeParts = parts({ hour: 'numeric', minute: '2-digit', hour12: true });
const dateParts = parts({ day: '2-digit', month: '2-digit', year: 'numeric' });
const longParts = parts({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dayParts = parts({ weekday: 'long', day: 'numeric', month: 'long' });

/** "2:15 pm" */
export function fmtTime(t?: number) {
  if (t == null || !Number.isFinite(t)) return '—';
  const p = timeParts(t);
  const h = p.hour === '0' || p.hour === '00' ? '12' : String(Number(p.hour));
  return `${h}:${p.minute} ${(p.dayPeriod ?? '').toLowerCase()}`;
}
/** "2:15 pm WAT" — case header times, SLA due times, the audit log, printed pages and SMS. */
export const fmtTimeWat = (t?: number) => (t == null ? '—' : `${fmtTime(t)} WAT`);
/** "20/10/2026" */
export function fmtDate(t?: number) {
  if (t == null || !Number.isFinite(t)) return '—';
  const p = dateParts(t);
  return `${p.day}/${p.month}/${p.year}`;
}
/** "Mon 20 Oct 2026" — headings and long dates */
export function fmtLong(t: number) {
  const p = longParts(t);
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}
/** "Monday 20 October" — day headings in timelines and chat */
export function fmtDayName(t: number) {
  const p = dayParts(t);
  return `${p.weekday} ${p.day} ${p.month}`;
}
/** "20/10/2026, 2:15 pm" */
export const fmtDateTime = (t?: number) => (t == null ? '—' : `${fmtDate(t)}, ${fmtTime(t)}`);
export const fmtDateTimeWat = (t?: number) => (t == null ? '—' : `${fmtDateTime(t)} WAT`);

/** Hour of the day in Oyo (0–23). */
export const lagosHour = (t: number) => new Date(t + WAT_OFFSET).getUTCHours();
/** Midnight in Oyo for the day containing t. */
export const lagosDayStart = (t: number) => Math.floor((t + WAT_OFFSET) / DAY) * DAY - WAT_OFFSET;
/** "261020" for case references, in Oyo's calendar. */
export function lagosYymmdd(t: number) {
  const d = new Date(t + WAT_OFFSET);
  return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** "2026-10-21" in Oyo (date inputs). */
export function lagosIsoDate(t: number) {
  const d = new Date(t + WAT_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Relative time for lists: "just now", "12 min ago", "3 h ago", "yesterday", "3 days ago". */
export function fmtAgo(t: number, at: number) {
  const m = Math.round((at - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const days = Math.round((lagosDayStart(at) - lagosDayStart(t)) / DAY);
  if (days <= 0) return `${Math.floor(m / 60)} h ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** "1,234" */
export const fmtNum = (n: number) => (Number.isFinite(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '—');
/** "45%"; one decimal under 10% ("3.1%"). */
export function fmtPct(a: number, b = 100) {
  if (!b) return '—';
  const v = (a / b) * 100;
  if (v > 0 && v < 10) return `${(Math.round(v * 10) / 10).toString()}%`;
  return `${Math.round(v)}%`;
}

// ---------- phone numbers ----------

/**
 * One normaliser for every Nigerian mobile number input and comparison.
 * Accepts 0803 000 0001, 08030000001, 803 000 0001, +234 803 000 0001, +2348030000001, 2348030000001
 * (spaces, dashes, dots and brackets allowed). Returns "08030000001", or undefined if it is not a mobile number.
 */
export function normalisePhone(input?: string): string | undefined {
  if (!input) return undefined;
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return undefined;
  if (d.startsWith('234')) d = d.slice(3);
  if (d.length === 10 && /^[789]/.test(d)) d = `0${d}`;
  return /^0[789][01]\d{8}$/.test(d) ? d : undefined;
}
export const validPhone = (s: string) => !!normalisePhone(s);
/** Display format: "0803 000 0001" (unchanged if it isn't a Nigerian mobile number). */
export function displayPhone(s?: string) {
  const n = normalisePhone(s);
  return n ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : s ?? '';
}
/** Same person? Compares in normalised form. */
export const samePhone = (a?: string, b?: string) => !!a && !!b && normalisePhone(a) !== undefined && normalisePhone(a) === normalisePhone(b);
export const PHONE_HINT = 'Enter a Nigerian mobile number, e.g. 0803 000 0001';
/** Finds phone numbers in free text (chat masking), including the +234 and 234 forms. */
export const PHONE_IN_TEXT = /(?:\+?234[\s\-]?|0)[789][01]\d(?:[\s\-]?\d){7}/g;

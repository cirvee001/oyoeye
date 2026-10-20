import { DAY, HOUR, isOpen, isOverdue, median } from './engine';
import type { CategoryId, Deployment, Incident } from './types';

export const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function metrics(rows: Incident[], at: number) {
  const acked = rows.filter((i) => i.t.acknowledged);
  // Work done: resolved by the responder (awaiting confirmation), closed or referred.
  const resolved = rows.filter((i) => ['resolved', 'closed', 'referred'].includes(i.status) && i.t.resolved);
  const closedTimes = resolved.filter((i) => i.t.resolved).map((i) => i.t.resolved! - i.createdAt);
  const arrived = rows.filter((i) => i.t.onScene && i.arriveDueAt);
  const verified = rows.filter((i) => i.verification && i.verification !== 'timeout');
  return {
    total: rows.length,
    open: rows.filter(isOpen).length,
    resolved: resolved.length,
    overdue: rows.filter((i) => isOverdue(i, at)).length,
    critical: rows.filter((i) => i.severity === 'critical').length,
    criticalOpen: rows.filter((i) => i.severity === 'critical' && isOpen(i)).length,
    invalid: rows.filter((i) => i.status === 'rejected').length,
    closed: rows.filter((i) => i.status === 'closed' || i.status === 'referred').length,
    reopened: rows.filter((i) => i.reopenCount > 0).length,
    medianAck: median(acked.map((i) => i.t.acknowledged! - i.createdAt)),
    medianResolve: median(closedTimes),
    medianArrive: median(arrived.map((i) => i.t.onScene! - i.createdAt)),
    ackWithin: acked.filter((i) => i.t.acknowledged! <= i.ackDueAt).length,
    acked: acked.length,
    resolvedWithin: resolved.filter((i) => i.t.resolved && i.t.resolved <= i.resolveDueAt).length,
    arriveWithin: arrived.filter((i) => i.t.onScene! <= i.arriveDueAt!).length,
    arrived: arrived.length,
    verifiedYes: verified.filter((i) => i.verification === 'yes').length,
    verified: verified.length,
    reports: rows.reduce((n, i) => n + i.reports.length, 0),
  };
}

export function countBy<T extends string>(rows: Incident[], key: (i: Incident) => T) {
  const m = new Map<T, number>();
  for (const i of rows) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Category × LGA growth: last 72h vs the 72h before. */
export function hotspots(dep: Deployment, all: Incident[], at: number, filter: (i: Incident) => boolean = (i) => !i.restricted) {
  const win = 72 * HOUR;
  const recent = all.filter((i) => filter(i) && i.createdAt > at - win);
  const prior = all.filter((i) => filter(i) && i.createdAt <= at - win && i.createdAt > at - 2 * win);
  const key = (i: Incident) => `${i.lgaId}|${i.category}`;
  const r = new Map<string, number>();
  const p = new Map<string, number>();
  recent.forEach((i) => r.set(key(i), (r.get(key(i)) ?? 0) + i.reports.length));
  prior.forEach((i) => p.set(key(i), (p.get(key(i)) ?? 0) + i.reports.length));
  return [...r.entries()]
    .map(([k, n]) => {
      const [lgaId, category] = k.split('|');
      const before = p.get(k) ?? 0;
      return { lga: dep.lgas.find((l) => l.id === lgaId)!, category: category as CategoryId, n, before, change: (n - before) / Math.max(before, 4) };
    })
    .filter((h) => h.n >= 4 && h.change >= 0.3)
    .sort((a, b) => b.n * b.change - a.n * a.change)
    .slice(0, 6);
}

/** Places (never people) where security reports repeat. */
export function securityClusters(all: Incident[], at: number, hours = 72) {
  const rows = all.filter((i) => i.category === 'security' && !i.sensitiveOnly && i.status !== 'rejected' && i.createdAt > at - hours * HOUR);
  const byArea = new Map<string, Incident[]>();
  rows.forEach((i) => {
    const k = `${i.lgaId}|${i.area}`;
    byArea.set(k, [...(byArea.get(k) ?? []), i]);
  });
  return [...byArea.values()]
    .filter((xs) => xs.length >= 3)
    .map((xs) => ({
      lgaId: xs[0].lgaId,
      area: xs[0].area,
      incidents: xs,
      reports: xs.reduce((n, i) => n + i.reports.length, 0),
      types: countBy(xs, (i) => i.subcategory ?? 'other'),
      first: Math.min(...xs.map((i) => i.createdAt)),
      last: Math.max(...xs.map((i) => i.createdAt)),
      night: xs.filter((i) => {
        const h = new Date(i.createdAt).getHours();
        return h >= 19 || h < 5;
      }).length,
    }))
    .sort((a, b) => b.incidents.length - a.incidents.length);
}

export function lastDays(all: Incident[], at: number, days: number) {
  return all.filter((i) => i.createdAt > at - days * DAY);
}

import { PHONE_HINT } from '../format';
import { useState } from 'react';
import type { FocalGroup, Person } from '../platform/types';
import { FOCAL_GROUPS, LEADERS, agency, community, communityCases, dep, focalManageable, lgaOf, persona, safeSecurity, subLabel, useStore, validPhone } from '../store';
import { catLabel, useLang } from '../i18n';
import { initials } from '../roles';
import { Card, CatIcon, Chips, CountTitle, Icon, Sheet, StatusPill, ago, go, run, useNow } from '../ui';
import { StaffStatus } from './Stations';

/** "Help from police, Amotekun and 615 is free" — on every citizen and focal-person screen (v2.3 §4.4). */
export function HelpBanner() {
  const [, t] = useLang();
  return (
    <div className="help-free" role="note">
      <a href="#/misconduct">
        {t('help.free')} <b>{t('help.never')}</b> {t('help.report')}
      </a>
      <a className="hf-rules" href="#/rules">
        {t('nav.rules')}
      </a>
    </div>
  );
}

/** Community focal person: home. */
export function FocalHome() {
  const [, t] = useLang();
  const me = persona();
  const s = useStore((x) => x);
  const mine = communityCases(s, me);
  return (
    <div className="phone">
      <div>
        <h1>{t('fc.hello', { name: me.name.split(' ').slice(-2, -1)[0] ?? me.name })}</h1>
        <p className="muted small">{`${me.title} · ${me.verified ? t('fc.verified') : t('fc.waiting')}`}</p>
      </div>
      <div className="tiles">
        <button className="tile" onClick={() => go('/report')}>
          <span className="tile-ico">
            <Icon name="plus" size={30} />
          </span>
          <b>{t('r.focal.title')}</b>
          <small>{t('fc.report.sub', { c: me.community ?? '' })}</small>
        </button>
        <button className="tile" onClick={() => go('/mycommunity')}>
          <span className="tile-ico">
            <Icon name="officers" size={30} />
          </span>
          <b>{t('nav.community')}</b>
          <small>{t('fc.open', { n: mine.filter((i) => i.status !== 'closed').length, c: me.community ?? '' })}</small>
        </button>
      </div>
      <div className="notice small row between">
        <span>{t('fc.rules')}</span>
        <a className="btn sm" href="#/rules">
          {t('rb.again')}
        </a>
      </div>
      <div className="notice small">
        {t('fc.note')}
      </div>
    </div>
  );
}

/** My community: cases in their ward/village and 2 km around, security in safe words only. */
export function MyCommunity() {
  const [lang, t] = useLang();
  const me = persona();
  const at = useNow();
  const s = useStore((x) => x);
  const rows = communityCases(s, me).slice(0, 40);
  return (
    <div className="phone">
      <div>
        <h1>{t('nav.community')}</h1>
        <p className="muted small">{t('fc.sub', { c: me.community ?? '', lga: me.lgaId ? lgaOf(me.lgaId).name : '' })}</p>
      </div>
      {!rows.length && <div className="empty">{t('fc.empty', { c: me.community ?? '' })}</div>}
      {rows.map((i) => (
        <div key={i.id} className="card pad stack">
          <div className="row between">
            <span className="row" style={{ gap: 8 }}>
              <CatIcon c={i.category} size={18} />
              <b>{i.restricted ? t('fc.seccase') : lang === 'yo' ? catLabel(i.category, lang) : subLabel(i.category, i.subcategory)}</b>
            </span>
            <StatusPill i={i} lang={lang} />
          </div>
          {i.restricted ? (
            <div className="small">
              {safeSecurity(i, lang)} <span className="muted">· {lgaOf(i.lgaId).name}</span>
            </div>
          ) : (
            <div className="small">
              {i.area} · {i.title}
            </div>
          )}
          <div className="tiny muted">{t('fc.reported', { ago: ago(i.createdAt, at, lang) })}</div>
        </div>
      ))}
    </div>
  );
}

/** Commander "My officers → Community" and chairman "Community": focal persons they look after. */
export function FocalList({ showLeaders }: { showLeaders?: boolean }) {
  const me = persona();
  useStore((s) => s.audit.length);
  const [invite, setInvite] = useState(false);
  const [suspending, setSuspending] = useState<Person>();
  const list = focalManageable(me);
  const lgas = me.role === 'chairman' ? [me.lgaId!] : agency(me.agencyId)?.lgaIds ?? [];
  const leaders = LEADERS.filter((l) => lgas.includes(l.lgaId));
  return (
    <>
      <section className="card worklist">
        <div className="wl-head">
          <h2>
            <CountTitle title="Community focal persons" n={list.length} />
          </h2>
          <button className="btn primary" onClick={() => setInvite(true)}>
            <Icon name="plus" size={16} /> Invite focal person
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Group</th>
                <th>Community / ward</th>
                <th>Phone</th>
                <th>Sponsor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    No focal persons yet. Invite the Baale's secretary, the hunters' leader, the Iyaloja, farmers' and herders' representatives.
                  </td>
                </tr>
              )}
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="row nowrap" style={{ gap: 10 }}>
                      <span className="avatar sm">{initials(p.name)}</span>
                      <b>{p.name}</b>
                    </div>
                  </td>
                  <td className="small">{FOCAL_GROUPS[p.focalGroup ?? 'youth']}</td>
                  <td className="small">
                    {p.community}
                    <div className="tiny muted">
                      {p.ward} · {p.lgaId ? lgaOf(p.lgaId).name : ''}
                    </div>
                  </td>
                  <td className="small nowrap">{p.phone}</td>
                  <td className="small">{p.sponsor}</td>
                  <td>{p.staffStatus === 'active' ? p.verified ? <span className="pill sf-active">Registered</span> : <span className="pill sf-invited">Activated — register</span> : <StaffStatus s={p.staffStatus} />}</td>
                  <td className="nowrap">
                    {p.staffStatus === 'active' && !p.verified && (
                      <button className="btn sm primary" onClick={() => run(community.verify(p.id), `${p.name} registered.`)}>
                        Register
                      </button>
                    )}
                    {p.staffStatus === 'active' && (
                      <button className="btn sm" onClick={() => setSuspending(p)}>
                        Suspend
                      </button>
                    )}
                    {p.staffStatus === 'suspended' && (
                      <button className="btn sm" onClick={() => run(community.reinstate(p.id), `${p.name} reinstated.`)}>
                        Reinstate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {showLeaders && (
        <Card title={<CountTitle title="Traditional-ruler contacts" n={leaders.length} />} right={<span className="small muted">Contacts, not users — they get SMS notices only</span>} pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Name</th>
                  <th>Areas</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => (
                  <tr key={l.id}>
                    <td className="strong">{l.title}</td>
                    <td>{l.name}</td>
                    <td className="small">{l.areas.join(', ')}</td>
                    <td className="small">{l.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {invite && <InviteFocal lgas={lgas} onClose={() => setInvite(false)} />}
      {suspending && <SuspendFocal p={suspending} onClose={() => setSuspending(undefined)} />}
    </>
  );
}

function InviteFocal({ lgas, onClose }: { lgas: string[]; onClose: () => void }) {
  const [v, setV] = useState({ name: '', phone: '', community: '', ward: '', lgaId: lgas[0] ?? 'ibn', focalGroup: 'hunters' as FocalGroup, sponsor: '' });
  const areas = lgaOf(v.lgaId).areas;
  return (
    <Sheet title="Invite community focal person" onClose={onClose}>
      <div className="stack lg">
        <div className="grid g2">
          <label className="field">
            <span>Full name</span>
            <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Pa Ojo Adebayo" />
          </label>
          <label className="field">
            <span>Phone</span>
            <input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="0803 000 0000" />
          </label>
          <label className="field">
            <span>LGA</span>
            <select className="input" value={v.lgaId} onChange={(e) => setV({ ...v, lgaId: e.target.value, community: '' })}>
              {lgas.map((l) => (
                <option key={l} value={l}>
                  {lgaOf(l).name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Community / village</span>
            <input className="input" list="focal-areas" value={v.community} onChange={(e) => setV({ ...v, community: e.target.value })} placeholder={areas[0]} />
            <datalist id="focal-areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Ward</span>
            <input className="input" value={v.ward} onChange={(e) => setV({ ...v, ward: e.target.value })} placeholder="e.g. Ward 3" />
          </label>
          <label className="field">
            <span>Group</span>
            <select className="input" value={v.focalGroup} onChange={(e) => setV({ ...v, focalGroup: e.target.value as FocalGroup })}>
              {(Object.keys(FOCAL_GROUPS) as FocalGroup[]).map((g) => (
                <option key={g} value={g}>
                  {FOCAL_GROUPS[g]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Sponsor</span>
          <input className="input" value={v.sponsor} onChange={(e) => setV({ ...v, sponsor: e.target.value })} placeholder="e.g. Nominated by the Baale of Igangan" />
        </label>
        {v.phone.length > 6 && !validPhone(v.phone) && <span className="small clk bad">{PHONE_HINT}</span>}
        <button className="btn primary lg block" disabled={!v.name.trim() || !v.community.trim() || !validPhone(v.phone)} onClick={() => run(community.invite(v), `Invite sent to ${v.phone}. They activate with the SMS code, then you register them.`) && onClose()}>
          Send invite by SMS
        </button>
        <p className="tiny muted center">Onboard associations from every side of a community. The platform must not become a tool for one group.</p>
      </div>
    </Sheet>
  );
}

function SuspendFocal({ p, onClose }: { p: Person; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet title={`Suspend ${p.name}`} onClose={onClose}>
      <div className="stack lg">
        <Chips options={['False reports', 'Partisan conduct', 'Left the community', 'Other']} value={reason} onChange={setReason} />
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <button className="btn danger lg block" disabled={!reason.trim()} onClick={() => run(community.suspend(p.id, reason), `${p.name} suspended.`) && onClose()}>
          Suspend
        </button>
      </div>
    </Sheet>
  );
}

/** LGA chairman "Community" page. */
export function ChairCommunity() {
  return <FocalList showLeaders />;
}

export const FOCAL_COUNT = () => dep.people.filter((p) => p.role === 'focal').length;

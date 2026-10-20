import { agency, lgaOf, persona, setDuty, setLang, signOut, useStore } from '../store';
import { initials, roleName } from '../roles';
import { Card, go } from '../ui';

export function Profile() {
  const me = persona();
  const on = useStore((s) => s.duty[me.id]?.on ?? true);
  const shift = useStore((s) => s.duty[me.id]?.shift);
  const lang = useStore((s) => s.lang);
  const staff = me.role !== 'citizen';
  const rows: [string, string | undefined][] = [
    ['Name', me.name],
    ['Role', roleName(me)],
    [staff ? 'Staff ID' : 'Phone', staff ? me.staffId : me.phone],
    ['Unit / agency', agency(me.agencyId)?.name ?? (me.lgaId ? `${lgaOf(me.lgaId).name} LGA` : staff ? 'Statewide' : undefined)],
    ['Title', me.title],
    ...(staff ? ([['Shift', shift ? shift[0].toUpperCase() + shift.slice(1) : '—']] as [string, string][]) : []),
  ];
  return (
    <div className="narrow stack lg">
      <Card>
        <div className="row" style={{ gap: 14 }}>
          <span className="avatar lg">{initials(me.name)}</span>
          <div>
            <h2>{me.name}</h2>
            <p className="muted">{roleName(me)}</p>
          </div>
        </div>
      </Card>
      <Card title="Details">
        <div className="inforow">
          {rows.map(([k, v]) => (
            <div key={k}>
              <div className="ir-label">{k}</div>
              <div className="ir-value">{v || '—'}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Settings">
        <div className="stack lg">
          {staff && (
            <label className="switch">
              <input type="checkbox" checked={on} onChange={(e) => setDuty(me.id, e.target.checked)} />
              <span>{on ? 'On duty — new cases and escalations can reach you' : 'Off duty'}</span>
            </label>
          )}
          <div className="row">
            <span className="small strong">Language</span>
            <div className="seg lang">
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
                English
              </button>
              <button className={lang === 'yo' ? 'on' : ''} onClick={() => setLang('yo')}>
                Yorùbá
              </button>
            </div>
          </div>
          <button
            className="btn danger-outline"
            onClick={() => {
              signOut();
              go('/signin');
            }}
          >
            Sign out
          </button>
        </div>
      </Card>
    </div>
  );
}

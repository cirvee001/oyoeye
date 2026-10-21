import { agency, lgaOf, persona, setDuty, setLang, signOut, useStore } from '../store';
import { useLang } from '../i18n';
import { initials, roleName } from '../roles';
import { Card, go } from '../ui';

export function Profile() {
  const me = persona();
  const on = useStore((s) => s.duty[me.id]?.on ?? true);
  const shift = useStore((s) => s.duty[me.id]?.shift);
  const [lang, t] = useLang();
  const staff = me.role !== 'citizen' && me.role !== 'focal';
  const role = me.role === 'citizen' ? t('role.citizen') : me.role === 'focal' ? t('role.focal') : roleName(me);
  const rows: [string, string | undefined][] = [
    [t('pf.name'), me.name],
    [t('pf.role'), role],
    [staff ? 'Staff ID' : t('pf.phone'), staff ? me.staffId : me.phone],
    [t('pf.area'), agency(me.agencyId)?.name ?? (me.lgaId ? `${lgaOf(me.lgaId).name} LGA` : staff ? 'Statewide' : undefined)],
    [t('pf.title'), me.title],
    ...(staff ? ([['Shift', shift ? shift[0].toUpperCase() + shift.slice(1) : '—']] as [string, string][]) : []),
  ];
  return (
    <div className="narrow stack lg">
      <Card>
        <div className="row" style={{ gap: 14 }}>
          <span className="avatar lg">{initials(me.name)}</span>
          <div>
            <h2>{me.name}</h2>
            <p className="muted">{role}</p>
          </div>
        </div>
      </Card>
      <Card title={t('pf.details')}>
        <div className="inforow">
          {rows.map(([k, v]) => (
            <div key={k}>
              <div className="ir-label">{k}</div>
              <div className="ir-value">{v || '—'}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title={t('pf.settings')}>
        <div className="stack lg">
          {staff && (
            <label className="switch">
              <input type="checkbox" checked={on} onChange={(e) => setDuty(me.id, e.target.checked)} />
              <span>{on ? 'On duty — new cases and escalations can reach you' : 'Off duty'}</span>
            </label>
          )}
          <div className="row">
            <span className="small strong" id="pf-lang">{t('lang.label')}</span>
            <div className="seg lang" role="group" aria-labelledby="pf-lang">
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
            {t('nav.signout')}
          </button>
        </div>
      </Card>
    </div>
  );
}

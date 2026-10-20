import { useState } from 'react';
import { agency, citizenByPhone, citizenSignIn, dep, findFocalByPhone, focalSignIn, signIn, staffSignIn, validPhone } from '../store';
import { Eye } from '../App';
import { initials, roleName } from '../roles';
import { Icon, go, run } from '../ui';
import { Activate } from './Activate';

/** Demo accounts, grouped the way officials think about them. */
export const DEMO_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Citizens', ids: ['cit1'] },
  { label: 'Community', ids: ['f-lasisi', 'f-alake'] },
  { label: 'Control room', ids: ['disp1', 'duty1'] },
  { label: 'Responders', ids: ['cmdr1', 'crp1', 'pat1', 'wst-head', 'wst-off1', 'sens1'] },
  { label: 'Oversight', ids: ['coord1', 'exec1', 'chr1', 'ovs1'] },
  { label: 'Admin', ids: ['adm1'] },
];
export const DEMO_IDS = DEMO_GROUPS.flatMap((g) => g.ids);
export const DEMO_OTP = '123456';

export function DemoCards({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="demo-list">
      {DEMO_GROUPS.map((g) => (
        <div key={g.label} className="dl-group">
          <div className="dl-label">{g.label}</div>
          {g.ids.map((id) => {
            const p = dep.people.find((x) => x.id === id)!;
            return (
              <button key={id} className="dl-row" onClick={() => onPick(id)}>
                <span className="avatar sm">{initials(p.name)}</span>
                <span className="dl-who">
                  <b>{p.name}</b>
                  <small>
                    {roleName(p)} · {p.role === 'citizen' ? p.phone : `${p.staffId}${agency(p.agencyId) ? ` · ${agency(p.agencyId)!.short}` : ''}`}
                  </small>
                </span>
                <span className="dl-go">Sign in →</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SignIn() {
  const [tab, setTab] = useState<'citizen' | 'staff'>('citizen');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [first, setFirst] = useState('');
  const [staffId, setStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [activating, setActivating] = useState(false);
  const known = sent ? citizenByPhone(phone) : undefined;
  // Community focal persons sign in with phone + PIN (no OTP).
  const focal = validPhone(phone) ? findFocalByPhone(phone) : undefined;
  const [fpin, setFpin] = useState('');

  const finishCitizen = () => {
    if (otp !== DEMO_OTP) return run('That code is not right. Use the demo code shown.');
    if (!known && !first.trim()) return run('Tell us your first name');
    citizenSignIn(phone, first);
    go('/home');
  };
  const staff = (id: string, p: string) => {
    if (run(staffSignIn(id, p))) go('');
  };
  const pickDemo = (id: string) => {
    const p = dep.people.find((x) => x.id === id)!;
    if (p.role === 'citizen' || p.role === 'focal') {
      signIn(p.id);
      go('/home');
    } else staff(p.staffId!, '1234');
  };

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="ab-logo">
          <Eye size={56} />
          <div>
            <h1>OyoEye</h1>
            <p>See it. Report it. Act on it.</p>
          </div>
        </div>
        <p className="ab-sub">Oyo State · {dep.emergencyLine} Security & Emergency. Citizens report; the right unit responds; everyone sees where each case is.</p>
        <button className="btn sos-cta xl block" onClick={() => go('/emergency')}>
          <Icon name="sos" size={24} /> Report an emergency now — no sign-in
        </button>
        <a className="ab-link" href="#/report">
          Report a problem anonymously →
        </a>
        <div className="ab-foot">
          <a href="#/rules">
            <Icon name="file" size={16} /> Rule book
          </a>
          <a href="#/track">
            <Icon name="list" size={16} /> Track a report
          </a>
          <a href="#/public">
            <Icon name="reports" size={16} /> Public dashboard
          </a>
          <a href="#/ussd">
            <Icon name="phone" size={16} /> *615# (USSD)
          </a>
        </div>
      </section>

      <section className="auth-form">
        <div className="af-inner">
          <h2>Sign in</h2>
          <p className="muted small">Citizens sign in with their phone. Staff use their Staff ID and PIN.</p>
          <div className="tabs">
            <button className={tab === 'citizen' ? 'on' : ''} onClick={() => setTab('citizen')}>
              Citizen
            </button>
            <button className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>
              Staff
            </button>
          </div>
          <div className="stack lg">
            {tab === 'citizen' ? (
              <>
                <label className="field">
                  <span>Phone number</span>
                  <input className="input lg" inputMode="tel" value={phone} onChange={(e) => (setPhone(e.target.value), setSent(false))} placeholder="0803 000 0001" />
                </label>
                {focal && focal.staffStatus === 'invited' ? (
                  <div className="notice warn small">You were invited as a community focal person. Activate first: Staff tab → First time? Activate my account.</div>
                ) : focal ? (
                  <>
                    <div className="notice small">Community focal person: {focal.name}. Enter your PIN.</div>
                    <label className="field">
                      <span>4-digit PIN</span>
                      <input className="input lg mono" type="password" inputMode="numeric" maxLength={4} value={fpin} onChange={(e) => setFpin(e.target.value.replace(/D/g, ''))} placeholder="••••" />
                    </label>
                    <button className="btn primary lg block" disabled={fpin.length !== 4} onClick={() => run(focalSignIn(phone, fpin)) && go('/home')}>
                      Sign in
                    </button>
                  </>
                ) : !sent ? (
                  <button className="btn primary lg block" disabled={!validPhone(phone)} onClick={() => setSent(true)}>
                    Send code
                  </button>
                ) : (
                  <>
                    <div className="demo-otp">
                      Demo code: <b className="mono">{DEMO_OTP}</b>
                    </div>
                    <label className="field">
                      <span>6-digit code</span>
                      <input className="input lg mono" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
                    </label>
                    {known ? (
                      <div className="small muted">Welcome back, {known.name.split(' ')[0]}.</div>
                    ) : (
                      <label className="field">
                        <span>New here? Your first name</span>
                        <input className="input lg" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="e.g. Funke" />
                      </label>
                    )}
                    <button className="btn primary lg block" disabled={otp.length !== 6} onClick={finishCitizen}>
                      Sign in
                    </button>
                  </>
                )}
                {!validPhone(phone) && phone.length > 6 && <span className="small muted">Enter a Nigerian mobile number, e.g. 0803 000 0001</span>}
              </>
            ) : activating ? (
              <Activate onCancel={() => setActivating(false)} />
            ) : (
              <>
                <label className="field">
                  <span>Staff ID</span>
                  <input className="input lg mono" value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="OY-615-001" />
                </label>
                <label className="field">
                  <span>4-digit PIN</span>
                  <input className="input lg mono" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
                </label>
                <button className="btn primary lg block" disabled={!staffId || pin.length !== 4} onClick={() => staff(staffId, pin)}>
                  Sign in
                </button>
                <button className="link-btn activate-link" onClick={() => setActivating(true)}>
                  First time? Activate my account →
                </button>
              </>
            )}
          </div>

          <div className="af-demo">
            <h3>Demo accounts</h3>
            <p className="small muted">
              Staff PIN <b className="mono">1234</b> · citizen code <b className="mono">{DEMO_OTP}</b>
            </p>
            <DemoCards onPick={pickDemo} />
          </div>
        </div>
      </section>
    </div>
  );
}

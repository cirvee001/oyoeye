import { useState } from 'react';
import type { Person } from '../platform/types';
import { activate, agency, checkCode, findInvite, notMe, signIn, validPhone } from '../store';
import { Icon, go, run } from '../ui';

const INTRO = [
  { icon: 'check', title: 'Accept your case fast', text: 'When a case is passed to you, press Accept. If nobody accepts in time it escalates to your commander.' },
  { icon: 'pin', title: 'Update as you move', text: 'En route, On scene, add a note or photo. The control room and the citizen see the progress.' },
  { icon: 'pass', title: "Pass back if you can't go", text: 'Off duty or wrong area? Hand the case back to your commander with a reason. Never just ignore it.' },
];

/** Officer activation: SMS code → "This is me" → set PIN → intro (PRD v2.2 §4.4). */
export function Activate({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [p, setP] = useState<Person>();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [card, setCard] = useState(0);
  const invite = validPhone(phone) ? findInvite(phone) : undefined;

  const finish = () => {
    if (!p) return;
    signIn(p.id);
    go(p.role === 'officer' ? '/field' : '');
  };

  return (
    <div className="stack lg activate">
      <div className="steps-dots" aria-label={`Step ${step} of 4`}>
        {[1, 2, 3, 4].map((k) => (
          <span key={k} className={k <= step ? 'on' : ''} />
        ))}
      </div>
      {step === 1 && (
        <>
          <h3>Activate my account</h3>
          <p className="small muted">Your commander added you to Tell Seyi. Enter your phone number and the 6-digit code from the SMS.</p>
          <label className="field">
            <span>Phone number</span>
            <input className="input lg" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0099" />
          </label>
          {invite?.inviteCode && (
            <div className="demo-otp">
              Demo code (from the SMS): <b className="mono">{invite.inviteCode}</b>
            </div>
          )}
          <label className="field">
            <span>6-digit code</span>
            <input className="input lg mono" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
          </label>
          <button
            className="btn primary lg block"
            disabled={!validPhone(phone) || code.length !== 6}
            onClick={() => {
              const r = checkCode(phone, code);
              if (typeof r === 'string') return run(r);
              setP(r);
              setStep(2);
            }}
          >
            Continue
          </button>
        </>
      )}
      {step === 2 && p && (
        <>
          <h3>Is this you?</h3>
          <div className="summary">
            <div>
              <span>Name</span>
              <b>{p.name}</b>
            </div>
            <div>
              <span>Rank</span>
              <b>{p.rank}</b>
            </div>
            <div>
              <span>Station</span>
              <b>{agency(p.agencyId)?.name}</b>
            </div>
            <div>
              <span>Service number</span>
              <b className="mono">{p.serviceNumber}</b>
            </div>
            <div>
              <span>Staff ID (for sign-in)</span>
              <b className="mono">{p.staffId}</b>
            </div>
          </div>
          <button className="btn primary lg block" onClick={() => setStep(3)}>
            This is me
          </button>
          <button
            className="btn lg block"
            onClick={() => {
              notMe(p.id);
              run(undefined, 'Your commander has been told. They will correct the details and send a new code.');
              onCancel();
            }}
          >
            Not me — tell my commander
          </button>
        </>
      )}
      {step === 3 && p && (
        <>
          <h3>Choose a 4-digit PIN</h3>
          <p className="small muted">You will use it with your Staff ID {p.staffId} to sign in. Do not share it.</p>
          <label className="field">
            <span>PIN</span>
            <input className="input lg mono" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </label>
          <label className="field">
            <span>PIN again</span>
            <input className="input lg mono" type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </label>
          {pin2.length === 4 && pin !== pin2 && <span className="small clk bad">The two PINs are different.</span>}
          <button
            className="btn primary lg block"
            disabled={pin.length !== 4 || pin !== pin2}
            onClick={() => {
              if (run(activate(p.id, code, pin), 'Account activated.')) setStep(4);
            }}
          >
            Set PIN
          </button>
        </>
      )}
      {step === 4 && p && (
        <>
          <div className="intro-card">
            <span className="sc-ico t-green">
              <Icon name={INTRO[card].icon} size={22} />
            </span>
            <h3>{INTRO[card].title}</h3>
            <p className="small muted">{INTRO[card].text}</p>
            <div className="steps-dots small-dots">
              {INTRO.map((_, k) => (
                <span key={k} className={k === card ? 'on' : ''} />
              ))}
            </div>
          </div>
          {card < INTRO.length - 1 ? (
            <button className="btn primary lg block" onClick={() => setCard(card + 1)}>
              Next
            </button>
          ) : (
            <button className="btn primary lg block" onClick={finish}>
              Go to My cases
            </button>
          )}
          <button className="btn ghost block" onClick={finish}>
            Skip intro
          </button>
        </>
      )}
      {step < 4 && (
        <button className="btn ghost block" onClick={onCancel}>
          Back to sign-in
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Person } from '../platform/types';
import { ALERT_REPEAT_MS, alertDue, alertScope, alertTitle, alertsFor, isMuted } from '../alerts';
import { alertMutedUntil, muteAlerts, now, unmuteAlerts, useStore } from '../store';
import { chime, soundBlocked, unlockAudio } from '../sound';
import { Icon, hhmm, toast, useNow } from '../ui';

/**
 * Control-room alerts (PRD v2.5 §1): chime every 30 s while an SOS / Officer SOS / Critical case
 * is unopened, a toast with "Open", the tab title "(1) SOS — OyoEye", and a screen-reader announcement.
 */
export function AlertCenter({ me }: { me: Person }) {
  const s = useStore((x) => x);
  useNow(1000);
  const alerts = alertsFor(s, me);
  const muted = isMuted(s, me, now());
  const seen = useRef<Set<string> | null>(null);
  const last = useRef<number | undefined>(undefined);
  const [announce, setAnnounce] = useState('');
  const ids = alerts.map((a) => a.id).join();

  useEffect(() => {
    // First render: alerts already waiting count as "new" too (an operator signing in should hear them).
    seen.current ??= new Set();
    const fresh = alerts.filter((a) => !seen.current!.has(a.id));
    for (const a of fresh) {
      seen.current.add(a.id);
      toast(a.label, a.kind === 'sos' ? 'bad' : 'info', { label: 'Open', href: `#/case/${a.id}` });
    }
    if (fresh.length) {
      setAnnounce(`${fresh[0].label}. Open the case to stop the alert.`);
      last.current = undefined; // a new alert rings at once
    }
    if (typeof document !== 'undefined') document.title = alertTitle(alerts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  useEffect(() => {
    if (!alerts.length || muted) return;
    const t = Date.now();
    if (!alertDue(last.current, t)) return;
    if (chime(alerts.some((a) => a.kind === 'sos') ? 'sos' : 'critical')) last.current = t;
  });

  useEffect(() => () => void (typeof document !== 'undefined' && (document.title = 'OyoEye')), []);

  return (
    <div className="sr-only" aria-live="assertive" role="alert">
      {announce}
    </div>
  );
}

/** Speaker in the top bar: on by default, "Mute for 15 min" / "Unmute"; remembered per user. */
export function SpeakerControl({ me }: { me: Person }) {
  const s = useStore((x) => x);
  const at = useNow(5000);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setBlocked(soundBlocked()), 2000);
    setBlocked(soundBlocked());
    return () => clearInterval(t);
  }, []);
  if (!alertScope(me)) return null;
  const until = alertMutedUntil(s, me.id);
  const muted = until > at;
  return (
    <div className="speaker-wrap">
      {blocked && !muted && (
        <button className="chip warn sound-chip" onClick={() => (unlockAudio(), setTimeout(() => setBlocked(soundBlocked()), 200))}>
          Click to enable alert sound
        </button>
      )}
      <details className="speaker-menu">
        <summary className={`icon-btn speaker${muted ? ' muted' : ''}`} aria-label={muted ? `Alert sound muted until ${hhmm(until)}` : 'Alert sound on'} title={muted ? `Muted until ${hhmm(until)}` : 'Alert sound on'}>
          <Icon name={muted ? 'mute' : 'speaker'} size={20} />
        </summary>
        <div className="am-menu" role="menu">
          <div className="menu-note tiny muted">{muted ? `Alert sound muted until ${hhmm(until)}` : `Alert sound on — repeats every ${ALERT_REPEAT_MS / 1000} s until the case is opened`}</div>
          {muted ? (
            <button className="menu-item" role="menuitem" onClick={() => (unmuteAlerts(), unlockAudio())}>
              <Icon name="speaker" size={16} /> Unmute
            </button>
          ) : (
            <button className="menu-item" role="menuitem" onClick={() => muteAlerts(15)}>
              <Icon name="mute" size={16} /> Mute for 15 min
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

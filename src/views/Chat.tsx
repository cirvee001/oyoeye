import { fmtDayName, lagosDayStart } from '../format';
import { useEffect, useRef, useState } from 'react';
import { isOpen } from '../platform/engine';
import type { ChatChannel, ChatMessage, Incident } from '../platform/types';
import {
  BROADCAST,
  agency,
  canBroadcast,
  canPin,
  canPostChannel,
  canReadChannel,
  channelOf,
  channelsFor,
  chat,
  dep,
  hasPhone,
  holderLabel,
  lgaOf,
  maskPhones,
  messagesIn,
  onDuty,
  person,
  persona,
  subLabel,
  unreadIn,
  useStore,
  type State,
} from '../store';
import { initials } from '../roles';
import { CatIcon, Icon, Sheet, StatusPill, go, hhmm, run, samplePhoto, useNow } from '../ui';

const dayKey = (t: number) => String(lagosDayStart(t));
const dayLabel = (t: number, at: number) => {
  const d = lagosDayStart(t);
  const today = lagosDayStart(at);
  if (d === today) return 'Today';
  if (d === today - 86_400_000) return 'Yesterday';
  return fmtDayName(t);
};

function preview(m: ChatMessage | undefined, meId: string) {
  if (!m) return 'No messages yet';
  if (m.removedBy) return `Message removed by ${m.removedBy}`;
  const who = m.authorId === 'system' ? '' : m.authorId === meId ? 'You: ' : `${person(m.authorId)?.name.split(' ').slice(-1)[0]}: `;
  const body = m.kind === 'photo' ? '📷 Photo' : m.kind === 'voice' ? '🎤 Voice note' : m.kind === 'location' ? '📍 Location' : m.kind === 'case' ? '📋 Case card' : m.kind === 'broadcast' ? `📢 ${m.text}` : m.text ?? '';
  return who + (m.authorId === meId ? body : maskPhones(body));
}

/** WhatsApp-like station chat: channel list + conversation (PRD v2.2 §5.2). */
export function Chat({ channelId }: { channelId?: string }) {
  const me = persona();
  const s = useStore((x) => x);
  const list = channelsFor(s, me);
  const phone = me.role === 'officer';
  const picked = !!channelId && canReadChannel(me, channelId);
  const current = picked ? channelId : phone ? undefined : list[0]?.id;
  if (!list.length) return <div className="empty">You are not in any station chat. Chat follows your posting.</div>;
  return (
    <div className={`chat card${picked ? ' picked' : ''}${phone ? ' phone' : ''}`}>
      <aside className="chat-list">
        <div className="cl-head">
          <h2>Chats</h2>
        </div>
        {list.map((c) => {
          const msgs = messagesIn(s, c.id);
          const last = msgs.slice(-1)[0];
          const n = unreadIn(s, me, c.id);
          return (
            <a key={c.id} href={`#/chat/${c.id}`} className={`cl-row${c.id === current ? ' on' : ''}${c.kind === 'broadcast' ? ' bc' : ''}`}>
              <span className={`avatar${c.kind === 'broadcast' ? ' bc' : ''}`}>{c.kind === 'broadcast' ? <Icon name="urgent" size={18} /> : initials(c.name)}</span>
              <span className="cl-main">
                <span className="cl-top">
                  <b>{c.name}</b>
                  <small>{last ? hhmm(last.at) : ''}</small>
                </span>
                <span className="cl-bottom">
                  <span className="cl-prev">{preview(last, me.id)}</span>
                  {n > 0 && <span className="cl-n">{n}</span>}
                </span>
              </span>
            </a>
          );
        })}
      </aside>
      {current ? <Conversation key={current} channel={channelOf(current)!} s={s} phone={phone} /> : <div className="conv empty-conv">Choose a chat.</div>}
    </div>
  );
}

function Conversation({ channel, s, phone }: { channel: ChatChannel; s: State; phone: boolean }) {
  const me = persona();
  const at = useNow(15_000);
  const msgs = messagesIn(s, channel.id);
  const [members, setMembers] = useState(false);
  const [newBc, setNewBc] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chat.markRead(channel.id);
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [channel.id, msgs.length]);
  const canPost = canPostChannel(me, channel.id);
  const readOnly = channel.readOnlyIds.includes(me.id) && !channel.memberIds.includes(me.id);
  const all = [...channel.memberIds, ...channel.monitorIds];
  const onDutyN = channel.memberIds.filter((id) => onDuty(id)).length;
  const pinned = [...msgs].reverse().find((m) => m.pinned && !m.removedBy);
  const bc = channel.kind === 'broadcast';
  let lastDay = '';

  return (
    <section className="conv">
      <header className="conv-head">
        {phone && (
          <button className="icon-btn" onClick={() => go('/chat')} aria-label="Back to chats">
            <Icon name="back" size={20} />
          </button>
        )}
        <span className={`avatar${bc ? ' bc' : ''}`}>{bc ? <Icon name="urgent" size={18} /> : initials(channel.name)}</span>
        <div className="ch-who">
          <b>{channel.name}</b>
          <small>{bc ? 'Alerts from the 615 control room to stations' : `${channel.memberIds.length} members · ${onDutyN} on duty${channel.monitorIds.length ? ' · control room monitoring' : ''}`}</small>
        </div>
        <div className="spacer" />
        {bc && canBroadcast(me) && (
          <button className="btn primary sm" onClick={() => setNewBc(true)}>
            <Icon name="urgent" size={16} /> New broadcast
          </button>
        )}
        {!bc && (
          <button className="btn sm" onClick={() => setMembers(true)}>
            <Icon name="officers" size={16} /> Members
          </button>
        )}
      </header>
      <div className="conv-note">🔒 Screenshots are discouraged — messages are audited. Phone numbers are hidden.</div>
      {pinned && (
        <div className="pinbar">
          <Icon name="pinned" size={15} />
          <span>
            <b>{person(pinned.authorId)?.name}:</b> {pinned.authorId === me.id ? pinned.text : maskPhones(pinned.text ?? '')}
          </span>
        </div>
      )}
      <div className="msgs">
        {!msgs.length && <div className="empty">No messages yet. Say hello to your station.</div>}
        {msgs.map((m) => {
          const d = dayKey(m.at);
          const sep = d !== lastDay ? <div className="daysep">{dayLabel(m.at, at)}</div> : null;
          lastDay = d;
          return (
            <div key={m.id}>
              {sep}
              <Bubble m={m} channel={channel} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {readOnly && <div className="conv-ro">You are reading this chat as oversight (read-only).</div>}
      {canPost && !bc && <Composer channel={channel} />}
      {members && (
        <Sheet title={`${channel.name} — members`} onClose={() => setMembers(false)}>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Membership follows postings. Transferred or deactivated officers lose access straight away.
          </p>
          <div className="stack">
            {all.map((id) => {
              const p = person(id)!;
              const mon = channel.monitorIds.includes(id);
              return (
                <div key={id} className="pick-row">
                  <span className="row nowrap" style={{ gap: 10 }}>
                    <span className="avatar sm">{initials(p.name)}</span>
                    <span>
                      <b>{p.name}</b>
                      <div className="tiny muted">{p.rank ?? p.title}</div>
                    </span>
                  </span>
                  <span className="row nowrap" style={{ gap: 6 }}>
                    {mon && <span className="badge info">Control room</span>}
                    <span className={`duty-dot${onDuty(id) ? ' on' : ''}`} /> <span className="small muted">{onDuty(id) ? 'On duty' : 'Off duty'}</span>
                  </span>
                </div>
              );
            })}
            {channel.readOnlyIds.map((id) => (
              <div key={id} className="pick-row">
                <b>{person(id)?.name}</b>
                <span className="badge">Read-only oversight</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
      {newBc && <BroadcastSheet onClose={() => setNewBc(false)} />}
    </section>
  );
}

function Bubble({ m, channel }: { m: ChatMessage; channel: ChatChannel }) {
  const me = persona();
  const [seen, setSeen] = useState(false);
  if (m.kind === 'system') return <div className="sysmsg">{m.text}</div>;
  const mine = m.authorId === me.id;
  const author = person(m.authorId);
  const text = m.text ? (mine ? m.text : maskPhones(m.text)) : '';
  const others = channel.memberIds.filter((id) => id !== m.authorId && onDuty(id));
  const seenBy = m.seenBy.filter((id) => id !== m.authorId);
  const allSeen = others.length > 0 && others.every((id) => m.seenBy.includes(id));
  const removable = !m.removedBy && (mine || canPin(me, m.channelId));
  if (m.kind === 'broadcast') return <BroadcastBubble m={m} channel={channel} />;
  return (
    <div className={`bubble-row${mine ? ' mine' : ''}`}>
      <div className={`bubble${m.urgent ? ' urgent' : ''}${m.kind === 'case' ? ' case' : ''}`} onClick={() => setSeen(!seen)}>
        {!mine && (
          <div className="b-author">
            {author?.name}
            {author?.rank && <span> · {author.rank}</span>}
            {channel.monitorIds.includes(m.authorId) && <span className="badge info">Control room</span>}
            {author?.role === 'focal' && <span className="badge good">Community focal person</span>}
          </div>
        )}
        {m.urgent && <div className="b-urgent">URGENT</div>}
        {m.removedBy ? (
          <i className="muted">Message removed by {m.removedBy}</i>
        ) : (
          <>
            {m.kind === 'photo' && m.photo && <img className="b-photo" src={m.photo} alt={m.text || 'Photo'} />}
            {m.kind === 'voice' && (
              <div className="b-voice">
                <Icon name="mic" size={16} /> <span className="wave" /> {m.text?.replace('Voice note ', '') ?? '0:05'}
              </div>
            )}
            {m.kind === 'location' && (
              <div className="b-loc">
                <Icon name="pin" size={18} /> <span>{text || 'Shared location'}</span>
              </div>
            )}
            {m.kind === 'case' && m.caseId && <CaseCard id={m.caseId} />}
            {(m.kind === 'text' || (m.kind === 'photo' && text)) && <div className="b-text">{text}</div>}
            {mine && m.text && hasPhone(m.text) && <div className="b-hint">Phone numbers are hidden in chat. Use the case page to contact reporters.</div>}
          </>
        )}
        <div className="b-meta">
          {m.pinned && <Icon name="pinned" size={12} />}
          {hhmm(m.at)}
          {mine && <span className={`ticks${allSeen ? ' seen' : ''}`}>{allSeen ? '✓✓' : '✓'}</span>}
        </div>
        {seen && (
          <div className="b-seen" onClick={(e) => e.stopPropagation()}>
            <span className="tiny">
              Seen by {seenBy.length}
              {seenBy.length ? `: ${seenBy.map((id) => person(id)?.name).filter(Boolean).join(', ')}` : ''}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {canPin(me, m.channelId) && !m.removedBy && (
                <button className="link-btn" onClick={() => run(chat.pin(m.id), m.pinned ? 'Unpinned.' : 'Pinned for the station.')}>
                  {m.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {removable && (
                <button className="link-btn danger" onClick={() => run(chat.remove(m.id), 'Message removed. The audit record is kept.')}>
                  Remove
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BroadcastBubble({ m, channel }: { m: ChatMessage; channel: ChatChannel }) {
  const me = persona();
  const targets = m.targets ?? [];
  const acks = m.acks ?? {};
  const n = Object.keys(acks).length;
  const myStation = channel.stationId;
  const canAck = !!myStation && targets.includes(myStation) && me.agencyId === myStation && !acks[myStation];
  return (
    <div className="bc-bubble">
      <div className="bc-head">
        <Icon name="urgent" size={16} /> Control room alert · {person(m.authorId)?.name} · {hhmm(m.at)}
      </div>
      <div className="bc-text">{maskPhones(m.text ?? '')}</div>
      {channel.kind === 'broadcast' ? (
        <div className="bc-acks">
          <b>
            Acknowledged by {n} of {targets.length} stations
          </b>
          <div className="tiny muted">{targets.map((id) => `${agency(id)?.short}${acks[id] ? ' ✓' : ''}`).join(' · ')}</div>
        </div>
      ) : myStation && acks[myStation] ? (
        <div className="bc-acks">
          Seen ✓ by {acks[myStation].by} at {hhmm(acks[myStation].at)}
        </div>
      ) : canAck ? (
        <button className="btn primary sm" onClick={() => run(chat.ack(m.id), 'Acknowledged for your station.')}>
          Seen ✓
        </button>
      ) : (
        <div className="bc-acks tiny muted">Waiting for {agency(myStation)?.short} to acknowledge</div>
      )}
    </div>
  );
}

/** Case card: ref, type, area, live status pill, who holds it. Never the reporter. */
export function CaseCard({ id }: { id: string }) {
  const i = useStore((s) => s.incidents).find((x) => x.id === id);
  if (!i) return <div className="small muted">Case not found</div>;
  return (
    <div className="casecard">
      <div className="row nowrap" style={{ gap: 8 }}>
        <CatIcon c={i.category} size={16} />
        <span className="mono small">{i.ref}</span>
        <StatusPill i={i} />
      </div>
      <b>{subLabel(i.category, i.subcategory)}</b>
      <div className="small muted">
        {i.area}, {lgaOf(i.lgaId).name} · with {holderLabel(i)}
      </div>
      <button
        className="btn sm"
        onClick={(e) => {
          e.stopPropagation();
          go(`/case/${i.id}`);
        }}
      >
        View case
      </button>
    </div>
  );
}

function Composer({ channel }: { channel: ChatChannel }) {
  const me = persona();
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [rec, setRec] = useState<number>();
  const [share, setShare] = useState(false);
  const recRef = useRef<number>(0);
  const send = (v: Parameters<typeof chat.send>[1]) => {
    if (run(chat.send(channel.id, { ...v, urgent }))) {
      setText('');
      setUrgent(false);
    }
  };
  const station = agency(channel.stationId);
  return (
    <div className={`composer${urgent ? ' urgent' : ''}`}>
      <details className="more clip">
        <summary className="icon-btn" aria-label="Attach">
          <Icon name="clip" size={20} />
        </summary>
        <div className="more-menu up" role="menu">
          <button className="menu-item" onClick={() => send({ kind: 'photo', text: text.trim() || undefined, photo: samplePhoto(`${station?.short ?? 'Station'} · ${me.name}`) })}>
            <Icon name="camera" size={16} /> Photo
          </button>
          {!channel.community && (
            <button className="menu-item" onClick={() => setShare(true)}>
              <Icon name="file" size={16} /> Share a case
            </button>
          )}
          <button className="menu-item" onClick={() => send({ kind: 'location', text: `${station?.address ?? station?.short ?? 'My location'}` })}>
            <Icon name="pin" size={16} /> Share my location
          </button>
        </div>
      </details>
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && text.trim() && send({ kind: 'text', text })}
        placeholder={urgent ? 'Urgent message to everyone on duty…' : 'Type a message (use @name to mention)'}
        aria-label="Message"
      />
      <button className={`icon-btn urgent-t${urgent ? ' on' : ''}`} onClick={() => setUrgent(!urgent)} title="Urgent: push to everyone on duty and SMS the commander" aria-label="Urgent message" aria-pressed={urgent}>
        <Icon name="urgent" size={20} />
      </button>
      {text.trim() ? (
        <button className="send-btn" onClick={() => send({ kind: 'text', text })} aria-label="Send">
          <Icon name="send" size={20} />
        </button>
      ) : (
        <button
          className={`send-btn${rec ? ' rec' : ''}`}
          aria-label="Hold to record a voice note"
          onPointerDown={() => {
            recRef.current = performance.now();
            setRec(1);
          }}
          onPointerUp={() => {
            const secs = Math.max(1, Math.round((performance.now() - recRef.current) / 1000));
            setRec(undefined);
            send({ kind: 'voice', text: `Voice note 0:${String(Math.min(59, secs + 3)).padStart(2, '0')}` });
          }}
          onPointerLeave={() => rec && setRec(undefined)}
        >
          <Icon name="mic" size={20} />
        </button>
      )}
      {share && <ShareCase channel={channel} onClose={() => setShare(false)} onPick={(i) => (send({ kind: 'case', caseId: i.id }), setShare(false))} />}
    </div>
  );
}

function ShareCase({ channel, onClose, onPick }: { channel: ChatChannel; onClose: () => void; onPick: (i: Incident) => void }) {
  const incidents = useStore((s) => s.incidents);
  const open = incidents.filter((i) => i.agencyId === channel.stationId && (isOpen(i) || i.status === 'resolved')).slice(0, 30);
  return (
    <Sheet title="Share a case" onClose={onClose}>
      {!open.length ? (
        <div className="empty">No open cases at {channel.name}.</div>
      ) : (
        <div className="stack">
          {open.map((i) => (
            <button key={i.id} className="pick-row click" onClick={() => onPick(i)}>
              <span>
                <b>{subLabel(i.category, i.subcategory)}</b> <span className="mono small muted">{i.ref}</span>
                <div className="small muted">
                  {i.area}, {lgaOf(i.lgaId).name}
                </div>
              </span>
              <StatusPill i={i} />
            </button>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>
        Case cards never show who reported the case.
      </p>
    </Sheet>
  );
}

function BroadcastSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'all' | 'org' | 'lgas'>('lgas');
  const [orgId, setOrg] = useState('org-npf');
  const [lgaIds, setLgas] = useState<string[]>([]);
  const targets = chat.broadcastTargets({ kind, orgId, lgaIds });
  return (
    <Sheet title="New control-room broadcast" onClose={onClose} wide>
      <div className="stack lg">
        <label className="field">
          <span>Alert</span>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="BOLO: white Toyota Sienna, partial plate KTU-, last seen Ojoo, heading Moniya" />
        </label>
        <div className="field">
          <span>Send to</span>
          <div className="radios">
            {(
              [
                ['lgas', 'Stations covering LGAs'],
                ['org', 'One organisation'],
                ['all', 'All stations'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className={kind === k ? 'on' : ''}>
                <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {l}
              </label>
            ))}
          </div>
        </div>
        {kind === 'org' && (
          <select className="input" value={orgId} onChange={(e) => setOrg(e.target.value)}>
            {dep.organisations
              .filter((o) => o.kind !== 'control_room' && o.kind !== 'sensitive')
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        )}
        {kind === 'lgas' && (
          <div className="lga-grid">
            {dep.lgas.map((l) => (
              <label key={l.id} className={`chk${lgaIds.includes(l.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={lgaIds.includes(l.id)} onChange={(e) => setLgas(e.target.checked ? [...lgaIds, l.id] : lgaIds.filter((x) => x !== l.id))} />
                {l.name}
              </label>
            ))}
          </div>
        )}
        <div className="notice small">
          Will reach <b>{targets.length}</b> live station{targets.length === 1 ? '' : 's'}
          {targets.length ? `: ${targets.map((a) => a.short).join(', ')}` : ''}. Each must press "Seen ✓".
        </div>
        <button className="btn primary lg block" disabled={!text.trim() || !targets.length} onClick={() => run(chat.broadcast(text, { kind, orgId, lgaIds }), `Broadcast sent to ${targets.length} stations.`) && onClose()}>
          Send broadcast
        </button>
      </div>
    </Sheet>
  );
}

export { BROADCAST };

import { useEffect, useRef, useState } from 'react';
import { areaPoint } from '../deployments/oyo';
import { getLocation, resolvePoint, type Located } from '../geo';
import { useLang } from '../i18n';
import { dep, lgaOf, useStore } from '../store';
import { Icon } from '../ui';
import { LiveMap } from './LiveMap';

// "Use my location" first, then a draggable pin, auto-filled area chips and a landmark (PRD v2.5 §2).

export interface Place {
  lgaId: string;
  area: string;
  lat?: number;
  lng?: number;
  /** gps = "Use my location", pin = moved / tapped on the map, manual = chosen from the lists */
  source: 'gps' | 'pin' | 'manual';
}

export type LocStatus = 'idle' | 'finding' | 'ok' | 'denied' | 'outside';

/** Runs "Use my location" (or the simulated point from Demo controls). */
export function useLocator(onResult: (r: Located) => void) {
  const sim = useStore((s) => s.simLocation);
  const [status, setStatus] = useState<LocStatus>('idle');
  const alive = useRef(true);
  const cb = useRef(onResult);
  cb.current = onResult;
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const locate = () => {
    setStatus('finding');
    void getLocation(sim).then((r) => {
      if (!alive.current) return;
      setStatus(r.status === 'unavailable' ? 'denied' : r.status);
      cb.current(r);
    });
  };
  return { status, setStatus, locate };
}

export const placeFromPoint = (lgaId: string, area: string): Place => ({ lgaId, area, ...areaPoint(lgaId, area), source: 'manual' });

/** LGA + area lists (the fallback, and "✎ change area"). */
export function AreaPickers({ place, onChange, idPrefix }: { place: Place; onChange: (p: Place) => void; idPrefix: string }) {
  const [, t] = useLang();
  const lga = lgaOf(place.lgaId);
  return (
    <div className="grid g2">
      <label className="field" htmlFor={`${idPrefix}-lga`}>
        <span>{t('r.lga')}</span>
        <select id={`${idPrefix}-lga`} className="input" value={place.lgaId} onChange={(e) => onChange(placeFromPoint(e.target.value, lgaOf(e.target.value).areas[0]))}>
          {dep.lgas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor={`${idPrefix}-area`}>
        <span>{t('r.area')}</span>
        <select id={`${idPrefix}-area`} className="input" value={place.area} onChange={(e) => onChange(placeFromPoint(place.lgaId, e.target.value))}>
          {lga.areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** "Agbowo · Ibadan North ✎" */
export function PlaceChip({ place, onEdit, editing }: { place: Place; onEdit: () => void; editing: boolean }) {
  const [, t] = useLang();
  return (
    <button type="button" className={`place-chip${editing ? ' on' : ''}`} onClick={onEdit} aria-expanded={editing} aria-label={`${place.area}, ${lgaOf(place.lgaId).name} — ${t('r.place.edit')}`}>
      <Icon name="pin" size={16} />
      <span>
        {place.area} · {lgaOf(place.lgaId).name}
      </span>
      <span aria-hidden>✎</span>
    </button>
  );
}

export interface LocationStepProps {
  place?: Place;
  onChange: (p: Place) => void;
  landmark: string;
  onLandmark: (v: string) => void;
  landmarkUnknown: boolean;
  onLandmarkUnknown: (v: boolean) => void;
  /** Required for non-SOS reports. */
  landmarkRequired: boolean;
  showErrors: boolean;
  /** Operator 615 intake: no "Use my location" — the operator drops the pin. */
  intake?: boolean;
}

/** The "Where" step for citizen, focal-person and 615 intake reports. */
export function LocationStep({ place, onChange, landmark, onLandmark, landmarkUnknown, onLandmarkUnknown, landmarkRequired, showErrors, intake }: LocationStepProps) {
  const [, t] = useLang();
  const [editing, setEditing] = useState(false);
  const loc = useLocator((r) => {
    if (r.status === 'ok') onChange({ lgaId: r.lgaId, area: r.area, lat: r.lat, lng: r.lng, source: 'gps' });
    else setEditing(true); // fallback: the lists, plus the map to tap a point
  });
  const pick = (lat: number, lng: number) => {
    const r = resolvePoint(lat, lng);
    if (r.status !== 'ok') return loc.setStatus('outside');
    if (loc.status === 'outside') loc.setStatus('ok');
    onChange({ lgaId: r.lgaId, area: r.area, lat, lng, source: 'pin' });
  };
  const fallback = loc.status === 'denied' || loc.status === 'outside';
  const showMap = intake || !!place?.lat || fallback;
  const landmarkErr = showErrors && landmarkRequired && !landmark.trim() && !landmarkUnknown;
  return (
    <div className="stack loc-step">
      {!intake && (
        <button type="button" className={`btn xl block locate-btn${loc.status === 'ok' ? ' good' : ' primary'}`} onClick={loc.locate} disabled={loc.status === 'finding'} aria-describedby="loc-status">
          <Icon name="locate" size={22} /> {loc.status === 'finding' ? t('r.finding') : loc.status === 'ok' && place?.source !== 'manual' ? `${t('r.located')} ✓` : t('r.locate')}
        </button>
      )}
      <div id="loc-status" className="loc-status" aria-live="polite">
        {loc.status === 'denied' && <div className="notice warn small">{t('r.denied')}</div>}
        {loc.status === 'outside' && <div className="notice warn small">{t('r.outside')}</div>}
      </div>
      {showMap && (
        <div className="loc-map">
          <LiveMap rows={[]} controls={false} height={240} picker={{ lat: place?.lat, lng: place?.lng, onPick: pick, label: t('r.map.aria') }} />
          <p className="tiny muted">{place?.lat != null ? t('r.movepin') : t('r.tapmap')}</p>
        </div>
      )}
      {place && <PlaceChip place={place} editing={editing} onEdit={() => setEditing(!editing)} />}
      {(editing || fallback || (!place && !intake && loc.status === 'idle')) && (
        <>
          {!place && !fallback && !editing ? (
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              {t('r.place.edit')}
            </button>
          ) : (
            <AreaPickers place={place ?? placeFromPoint('ibn', lgaOf('ibn').areas[0])} onChange={onChange} idPrefix="loc" />
          )}
        </>
      )}
      <div className={`field landmark${landmarkErr ? ' has-err' : ''}`}>
        <label htmlFor="loc-landmark">
          {t('r.landmark')}
          {landmarkRequired && <span className="req" aria-hidden> *</span>}
        </label>
        <input
          id="loc-landmark"
          className="input lg"
          value={landmarkUnknown ? '' : landmark}
          disabled={landmarkUnknown}
          onChange={(e) => onLandmark(e.target.value)}
          placeholder={landmarkUnknown ? t('r.landmark.unknown.on') : t('r.landmark.ph')}
          aria-invalid={landmarkErr || undefined}
          aria-describedby={landmarkErr ? 'loc-landmark-err' : undefined}
          aria-required={landmarkRequired || undefined}
        />
        <label className="tiny row" style={{ gap: 6 }}>
          <input type="checkbox" checked={landmarkUnknown} onChange={(e) => onLandmarkUnknown(e.target.checked)} /> {t('r.landmark.unknown')}
        </label>
        {landmarkErr && (
          <span id="loc-landmark-err" className="field-err">
            {t('r.landmark.err')}
          </span>
        )}
      </div>
    </div>
  );
}

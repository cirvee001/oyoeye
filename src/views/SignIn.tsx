import { useState } from "react";
import {
  agency,
  citizenByPhone,
  citizenSignIn,
  dep,
  findFocalByPhone,
  focalSignIn,
  signIn,
  staffSignIn,
  validPhone,
} from "../store";
import { Logo } from "../App";
import { initials, roleName } from "../roles";
import { Icon, go, run } from "../ui";
import { Activate } from "./Activate";
import { LangToggle } from "./Citizen";
import { errText, useLang } from "../i18n";
import { unlockAudio } from "../sound";

/** Demo accounts, grouped the way officials think about them. */
export const DEMO_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Citizens", ids: ["cit1"] },
  { label: "Community", ids: ["f-lasisi", "f-alake"] },
  { label: "Control room", ids: ["disp1", "duty1"] },
  {
    label: "Responders",
    ids: ["cmdr1", "crp1", "pat1", "wst-head", "wst-off1", "sens1"],
  },
  { label: "Oversight", ids: ["coord1", "exec1", "chr1", "ovs1"] },
  { label: "Admin", ids: ["adm1"] },
];
export const DEMO_IDS = DEMO_GROUPS.flatMap((g) => g.ids);
export const DEMO_OTP = "123456";

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
                    {roleName(p)} ·{" "}
                    {p.role === "citizen"
                      ? p.phone
                      : `${p.staffId}${agency(p.agencyId) ? ` · ${agency(p.agencyId)!.short}` : ""}`}
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
  const [lang, t] = useLang();
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"citizen" | "staff">("citizen");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [first, setFirst] = useState("");
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [activating, setActivating] = useState(false);
  const known = sent ? citizenByPhone(phone) : undefined;
  // Community focal persons sign in with phone + PIN (no OTP).
  const focal = validPhone(phone) ? findFocalByPhone(phone) : undefined;
  const [fpin, setFpin] = useState("");

  const finishCitizen = () => {
    if (otp !== DEMO_OTP) return setErr(t("si.err.code"));
    if (!known && !first.trim()) return setErr(t("si.err.name"));
    setErr("");
    citizenSignIn(phone, first);
    go("/home");
  };
  // Signing in is the click that lets the browser play alert sounds (§1).
  const staff = (id: string, p: string) => {
    unlockAudio();
    if (run(staffSignIn(id, p))) go("");
  };
  const pickDemo = (id: string) => {
    unlockAudio();
    const p = dep.people.find((x) => x.id === id)!;
    if (p.role === "citizen" || p.role === "focal") {
      signIn(p.id);
      go("/home");
    } else staff(p.staffId!, "1234");
  };

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="ab-top">
          <Logo size={44} inverse />
          <div>
            <b className="ab-name">Tell Seyi</b>
            <small>{t("si.state")} · 615</small>
          </div>
        </div>

        <HeroArt label={t("si.art")} />

        <h1 className="ab-headline">
          <span>{t("si.headline1")}</span> <span className="ab-accent">{t("si.headline2")}</span>
        </h1>

        <div className="ab-actions">
          <button className="btn sos-cta xl block" onClick={() => go("/emergency")}>
            <Icon name="sos" size={24} /> {t("si.sos")}
          </button>
          <a className="ab-link" href="#/report">
            {t("si.anon")}
          </a>
        </div>
        <div className="ab-foot">
          <a href="#/rules">
            <Icon name="file" size={16} /> {t("nav.rules")}
          </a>
          <a href="#/track">
            <Icon name="list" size={16} /> {t("home.track")}
          </a>
          <a href="#/public">
            <Icon name="reports" size={16} /> {t("si.public")}
          </a>
          <a href="#/ussd">
            <Icon name="phone" size={16} /> {t("si.ussd")}
          </a>
        </div>
      </section>

      <section className="auth-form">
        <div className="af-inner">
          <div className="row between">
            <h2>{t("si.title")}</h2>
            <LangToggle />
          </div>
          <p className="muted small">{t("si.help")}</p>
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "citizen"}
              className={tab === "citizen" ? "on" : ""}
              onClick={() => setTab("citizen")}
            >
              {t("si.citizen")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "staff"}
              className={tab === "staff" ? "on" : ""}
              onClick={() => setTab("staff")}
            >
              {t("si.staff")}
            </button>
          </div>
          <div className="stack lg">
            {tab === "citizen" ? (
              <>
                <label className="field">
                  <span>{t("si.phone")}</span>
                  <input
                    className="input lg"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => (setPhone(e.target.value), setSent(false))}
                    placeholder="0803 000 0001"
                    aria-invalid={
                      (!validPhone(phone) && phone.length > 6) || undefined
                    }
                    aria-describedby="si-phone-err"
                  />
                </label>
                {focal && focal.staffStatus === "invited" ? (
                  <div className="notice warn small">
                    {t("si.focal.invited")}
                  </div>
                ) : focal ? (
                  <>
                    <div className="notice small">
                      {t("si.focal.pin", { name: focal.name })}
                    </div>
                    <label className="field">
                      <span>{t("si.pin")}</span>
                      <input
                        className="input lg mono"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={fpin}
                        onChange={(e) =>
                          setFpin(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="••••"
                      />
                    </label>
                    <button
                      className="btn primary lg block"
                      disabled={fpin.length !== 4}
                      onClick={() => (
                        unlockAudio(),
                        run(errText(focalSignIn(phone, fpin), lang)) &&
                          go("/home")
                      )}
                    >
                      {t("si.title")}
                    </button>
                  </>
                ) : !sent ? (
                  <button
                    className="btn primary lg block"
                    disabled={!validPhone(phone)}
                    onClick={() => setSent(true)}
                  >
                    {t("si.send")}
                  </button>
                ) : (
                  <>
                    <div className="demo-otp">
                      {t("si.democode")} <b className="mono">{DEMO_OTP}</b>
                    </div>
                    <label className="field">
                      <span>{t("si.code")}</span>
                      <input
                        className="input lg mono"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => (
                          setOtp(e.target.value.replace(/\D/g, "")),
                          setErr("")
                        )}
                        placeholder="••••••"
                      />
                    </label>
                    {known ? (
                      <div className="small muted">
                        {t("si.welcome", { name: known.name.split(" ")[0] })}
                      </div>
                    ) : (
                      <label className="field">
                        <span>{t("si.first")}</span>
                        <input
                          className="input lg"
                          value={first}
                          onChange={(e) => setFirst(e.target.value)}
                          placeholder={t("si.first.ph")}
                        />
                      </label>
                    )}
                    {err && (
                      <span className="field-err" role="alert">
                        {err}
                      </span>
                    )}
                    <button
                      className="btn primary lg block"
                      disabled={otp.length !== 6}
                      onClick={finishCitizen}
                    >
                      {t("si.title")}
                    </button>
                  </>
                )}
                {!validPhone(phone) && phone.length > 6 && (
                  <span id="si-phone-err" className="field-err">
                    {t("si.phone.err")}
                  </span>
                )}
              </>
            ) : activating ? (
              <Activate onCancel={() => setActivating(false)} />
            ) : (
              <>
                <label className="field">
                  <span>{t("si.staffId")}</span>
                  <input
                    className="input lg mono"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    placeholder="OY-615-001"
                  />
                </label>
                <label className="field">
                  <span>{t("si.pin")}</span>
                  <input
                    className="input lg mono"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                  />
                </label>
                <button
                  className="btn primary lg block"
                  disabled={!staffId || pin.length !== 4}
                  onClick={() => staff(staffId, pin)}
                >
                  {t("si.title")}
                </button>
                <button
                  className="link-btn activate-link"
                  onClick={() => setActivating(true)}
                >
                  {t("si.activate")}
                </button>
              </>
            )}
          </div>

          <div className="af-demo">
            <h3>Demo accounts</h3>
            <p className="small muted">
              Staff PIN <b className="mono">1234</b> · citizen code{" "}
              <b className="mono">{DEMO_OTP}</b>
            </p>
            <DemoCards onPick={pickDemo} />
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Sign-in hero: Ibadan at dusk (rusty rooftops of the old city, Mapo Hall on its hill, Cocoa House).
 * A resident raises a phone; the signal reaches the Tell Seyi shield; a patrol car responds below.
 * Stylised landmarks, not survey drawings. Decorative, so it is described once for screen readers.
 */
function HeroArt({ label }: { label: string }) {
  // rusty-roofed houses of the old city: [x, width, wall height]
  const houses: [number, number, number][] = [
    [0, 64, 34], [58, 52, 28], [104, 70, 40], [168, 48, 26], [210, 66, 36], [270, 54, 30],
    [318, 72, 42], [384, 50, 28], [428, 68, 38], [490, 56, 30], [540, 64, 36],
  ];
  const stars: [number, number][] = [[40, 40], [120, 22], [210, 58], [300, 18], [520, 30], [565, 84], [80, 110], [250, 120]];
  return (
    <svg className="ab-art" viewBox="0 0 600 420" preserveAspectRatio="xMidYMax slice" role="img" aria-label={label}>
      <defs>
        <radialGradient id="ab-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#A6F4C5" stopOpacity="0.45" />
          <stop offset="1" stopColor="#A6F4C5" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ab-wall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#F2E6D3" />
          <stop offset="1" stopColor="#D9C6A8" />
        </linearGradient>
      </defs>

      {stars.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r={k % 3 ? 1.4 : 2} fill="#FFFFFF" opacity="0.45" />
      ))}

      {/* signal from the phone to the shield */}
      <path d="M186 268 C230 160 330 112 410 104" fill="none" stroke="#A6F4C5" strokeWidth="2.5" strokeDasharray="6 7" strokeLinecap="round" />
      <circle cx="430" cy="96" r="78" fill="url(#ab-glow)" />
      <g fill="none" stroke="#FFFFFF" strokeOpacity="0.22">
        <circle cx="430" cy="96" r="52" />
        <circle cx="430" cy="96" r="70" />
      </g>
      <g transform="translate(398 58)">
        <path d="M32 4 54 12v17c0 15-9.5 25.5-22 31C19.5 54.5 10 44 10 29V12z" fill="#FFFFFF" />
        <path d="M23 19h18a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-8l-6 5v-5h-4a4 4 0 0 1-4-4V23a4 4 0 0 1 4-4z" fill="#0B6E4F" />
        <circle cx="26.5" cy="28" r="2" fill="#FFFFFF" />
        <circle cx="32" cy="28" r="2" fill="#FFFFFF" />
        <circle cx="37.5" cy="28" r="2" fill="#FFFFFF" />
      </g>

      {/* back skyline: Cocoa House and towers */}
      <g fill="#064432">
        <rect x="474" y="150" width="46" height="200" />
        <rect x="480" y="138" width="34" height="14" />
        <rect x="494" y="116" width="6" height="24" />
        <rect x="430" y="214" width="36" height="136" />
        <rect x="532" y="196" width="40" height="154" />
        <rect x="18" y="230" width="44" height="120" />
        <rect x="380" y="236" width="40" height="114" />
      </g>
      <g fill="#A6F4C5" opacity="0.35">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
          <rect key={r} x="482" y={162 + r * 22} width="30" height="5" rx="1" />
        ))}
      </g>

      {/* Mapo Hall on its hill */}
      <path d="M180 352 C220 262 340 262 380 352z" fill="#075c41" />
      <g fill="#E9DCC6">
        <rect x="232" y="248" width="96" height="10" />
        <path d="M226 248 280 226 334 248z" />
        {[0, 1, 2, 3, 4, 5].map((c) => (
          <rect key={c} x={238 + c * 16} y="258" width="6" height="34" />
        ))}
        <rect x="230" y="292" width="100" height="8" />
      </g>

      {/* rusty rooftops of the old city */}
      {houses.map(([x, w, h], k) => (
        <g key={k}>
          <rect x={x} y={392 - h} width={w} height={h} fill="url(#ab-wall)" />
          <path d={`M${x - 4} ${392 - h} L${x + w / 2} ${392 - h - 18} L${x + w + 4} ${392 - h}z`} fill={k % 2 ? '#B54708' : '#C4621C'} />
          <rect x={x + w / 2 - 6} y={392 - h + 10} width="12" height="12" fill="#5C3A1E" opacity="0.55" />
        </g>
      ))}
      <rect x="0" y="392" width="600" height="28" fill="#053325" />
      <path d="M0 404 H600" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="18 14" />

      {/* patrol car responding */}
      <g transform="translate(440 382)">
        <rect x="0" y="0" width="70" height="20" rx="6" fill="#FFFFFF" />
        <path d="M14 0 L22 -12 H48 L56 0z" fill="#FFFFFF" />
        <rect x="24" y="-10" width="9" height="8" rx="1.5" fill="#16202E" />
        <rect x="37" y="-10" width="9" height="8" rx="1.5" fill="#16202E" />
        <rect x="27" y="-17" width="8" height="5" rx="1.5" fill="#F04438" />
        <rect x="35" y="-17" width="8" height="5" rx="1.5" fill="#2E90FA" />
        <rect x="4" y="8" width="62" height="4" fill="#0B6E4F" />
        <circle cx="16" cy="20" r="6" fill="#101828" />
        <circle cx="54" cy="20" r="6" fill="#101828" />
      </g>

      {/* resident raising a phone */}
      <g transform="translate(150 262)">
        <ellipse cx="22" cy="128" rx="26" ry="5" fill="#000000" opacity="0.25" />
        <path d="M8 128 L12 78 H32 L36 128 H27 L22 92 L17 128z" fill="#101828" />
        <path d="M6 82 Q8 52 22 50 Q36 52 38 82z" fill="#1D4ED8" />
        <path d="M33 58 Q42 40 38 16" fill="none" stroke="#7A4A2B" strokeWidth="8" strokeLinecap="round" />
        <circle cx="22" cy="38" r="11" fill="#7A4A2B" />
        <path d="M11 35 Q22 20 33 35 Q28 29 22 29 Q16 29 11 35z" fill="#101828" />
        <rect x="31" y="0" width="14" height="22" rx="3" fill="#101828" />
        <rect x="33" y="3" width="10" height="15" rx="1.5" fill="#A6F4C5" />
      </g>
    </svg>
  );
}

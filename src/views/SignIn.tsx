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
import { Eye } from "../App";
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
        <div className="ab-logo">
          <Eye size={56} />
          <div>
            <h1>Tell Seyi</h1>
            <p>{t("si.tag")}</p>
          </div>
        </div>
        <p className="ab-sub">{t("si.sub")}</p>
        <button
          className="btn sos-cta xl block"
          onClick={() => go("/emergency")}
        >
          <Icon name="sos" size={24} /> {t("si.sos")}
        </button>
        <a className="ab-link" href="#/report">
          {t("si.anon")}
        </a>
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

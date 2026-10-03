"use client";
import Link from "next/link";
import { profileHighlights } from "@/lib/visual-summary";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { Notes, Empty } from "@/components/ui";
import { useContentMotion } from "@/components/use-content-motion";
import { LoadingState } from "@/components/feedback";
import {
  provenanceLabels,
  participationLabels,
  sourceLabels,
  safeProfileSource,
} from "@/lib/profile";

const sections = [
  "Zaman Çizelgesi",
  "Kanıt Pasaportu",
  "Yetenek Haritası",
  "Özet",
];

function ProfileView({ candidateId }: { candidateId: string }) {
  const { ref: motionRef, transition } = useContentMotion();
  const [section, setSection] = useState("Zaman Çizelgesi");
  const [focusedSection, setFocusedSection] = useState("Zaman Çizelgesi");
  const [months, setMonths] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: Model<"LivingProfile">;
    error?: string;
  }>();
  const key = `${candidateId}:${months}:${retry}`;
  useEffect(() => {
    let active = true;
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    api
      .livingProfile(
        candidateId,
        months ? since.toISOString().slice(0, 10) : "",
      )
      .then((data) => {
        if (active) setResponse({ key, data });
      })
      .catch((error) => {
        if (active) setResponse({ key, error: userError(error) });
      });
    return () => {
      active = false;
    };
  }, [candidateId, months, key]);
  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;
  return (
    <>
      <div
        className="profile-facts"
        aria-label="Profil kapsamı"
        aria-busy={!data && !error}
      >
        {data
          ? profileHighlights(data.summary).map((f) => (
              <div key={f.label}>
                <strong>{f.count}</strong>
                <span>{f.label}</span>
              </div>
            ))
          : ["Proje", "Gözlemlenen teknik kanıt", "Gelişim kaydı"].map(
              (label) => (
                <div key={label}>
                  <strong>
                    {error ? (
                      "—"
                    ) : (
                      <span className="fact-skeleton" aria-hidden="true" />
                    )}
                  </strong>
                  <span>{label}</span>
                </div>
              ),
            )}
        <p>
          Genel yetenek puanı değil,
          <br />
          hikâyenizin kayıt kapsamı.
        </p>
      </div>
      <div className="profile-navigation">
        <div
          className="view-switch profile-segments"
          role="tablist"
          aria-label="Profil bölümleri"
        >
          {sections.map((label, index) => (
            <button
              className="button secondary"
              key={label}
              role="tab"
              id={`profile-tab-${index}`}
              aria-selected={section === label}
              aria-controls="profile-panel"
              tabIndex={focusedSection === label ? 0 : -1}
              onFocus={() => setFocusedSection(label)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? sections.length - 1
                      : event.key === "ArrowRight"
                        ? (index + 1) % sections.length
                        : event.key === "ArrowLeft"
                          ? (index + sections.length - 1) % sections.length
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                document.getElementById(`profile-tab-${next}`)?.focus();
              }}
              onClick={() => {
                if (
                  section !== label ||
                  motionRef.current?.hasAttribute("data-transitioning")
                )
                  void transition(() => setSection(label));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          disabled={!data && !error}
          onClick={() => setRetry((v) => v + 1)}
        >
          Kayıtları yenile
        </button>
      </div>
      <div ref={motionRef} className="motion-viewport profile-content">
        <div className="motion-content">
          <section
            id="profile-panel"
            role="tabpanel"
            aria-labelledby={`profile-tab-${sections.indexOf(section)}`}
            tabIndex={0}
          >
            {section === "Zaman Çizelgesi" && (
              <div className="view-switch" aria-label="Zaman aralığı">
                {[
                  [0, "Tümü"],
                  [6, "Son 6 ay"],
                  [12, "Son 12 ay"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className="button secondary"
                    aria-pressed={months === value}
                    onClick={() => setMonths(Number(value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!data && !error && (
              <LoadingState label="Profil yükleniyor…" skeleton />
            )}
            {data && (
              <div className="profile-result">
                {section === "Özet" && (
                  <>
                    <h2 className="sr-only">Profil özeti</h2>
                    <p className="small">
                      Kayıt kapsamınız; bir yetenek puanı değil.
                    </p>
                    <div className="fact-grid">
                      {data.summary.map((f) => (
                        <article className="panel" key={f.label}>
                          <strong className="fact-count">{f.count}</strong>
                          <p>{f.label}</p>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                {section === "Yetenek Haritası" && (
                  <>
                    <h2>Yetenek Haritası</h2>
                    <div className="fact-grid">
                      {Object.entries(data.talent_map).map(([label, facts]) => (
                        <article className="panel" key={label}>
                          <h3>{label}</h3>
                          {facts.map((f) => (
                            <p key={f.label}>
                              <strong>{f.count}</strong> {f.label}
                            </p>
                          ))}
                        </article>
                      ))}
                    </div>
                  </>
                )}
                {section === "Zaman Çizelgesi" && (
                  <>
                    <h2>Gelişim Zaman Çizelgesi</h2>

                    {!data.timeline.length && (
                      <Empty
                        title="Zaman çizelgeniz burada başlar"
                        href="/aday#experiences"
                        action="Deneyim ekle"
                      >
                        Bir deneyim ekleyin; öğrenme ve katkılarınızı zaman
                        içinde görün.
                      </Empty>
                    )}
                    <ol className="talent-timeline">
                      {data.timeline.map((item, i) => {
                        const source = safeProfileSource(item.source_url);
                        const month = item.date.slice(0, 7);
                        return (
                          <li key={item.id}>
                            {(i === 0 ||
                              data.timeline[i - 1].date.slice(0, 7) !==
                                month) && <h3>{month}</h3>}
                            <article className="evidence-card">
                              <p className="eyebrow">
                                {sourceLabels[item.category] || item.category} ·{" "}
                                <time dateTime={item.date}>{item.date}</time>
                              </p>
                              <h3>{item.title}</h3>
                              <p>{provenanceLabels[item.status]}</p>
                              {item.date_basis === "recorded_at" && (
                                <p className="small">
                                  Sisteme eklenme tarihi; deneyimin gerçekleşme
                                  tarihi belirtilmedi.
                                </p>
                              )}
                              {item.organization && <p>{item.organization}</p>}
                              {item.role && (
                                <p>
                                  Rol:{" "}
                                  {participationLabels[
                                    item.role as keyof typeof participationLabels
                                  ] || item.role}
                                </p>
                              )}
                              {source && (
                                <a
                                  href={source}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Kaynak bağlantısı ↗
                                  <span className="sr-only">
                                    {" "}
                                    (yeni sekmede)
                                  </span>
                                </a>
                              )}
                            </article>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
                {section === "Kanıt Pasaportu" && (
                  <>
                    <h2>Kanıt Pasaportu</h2>
                    <p>
                      Beyan: kullanıcı kaydı. Bağlantı: kaynak adresi var,
                      içeriği doğrulanmadı. Gözlem: repo verisindeki teknik
                      dayanak. Doğrulanmış: bağımsız provider doğrulaması; bu
                      demoda uygulanmadı.
                    </p>
                    <div className="fact-grid">
                      {data.passport.map((f) => (
                        <article
                          className="panel"
                          key={`${f.family}:${f.status}`}
                        >
                          <h3>{sourceLabels[f.family] || f.family}</h3>
                          <p>{provenanceLabels[f.status]}</p>
                          <strong>{f.count} kayıt</strong>
                        </article>
                      ))}
                    </div>
                    {!data.passport.length && <p>Henüz kanıt kaydı yok.</p>}
                  </>
                )}
                <Notes title="Verinin sınırları" items={data.limitations} />
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default function LivingProfilePage() {
  const { data, ready } = useSession();
  return (
    <>
      {!ready ? (
        <p role="status">Seçim yükleniyor…</p>
      ) : data.candidate ? (
        <>
          <header className="profile-masthead">
            <div className="profile-monogram" aria-hidden="true">
              {data.candidate.name.charAt(0).toLocaleUpperCase("tr")}
            </div>
            <div>
              <h1>{data.candidate.name}</h1>
              <p className="eyebrow">YAŞAYAN YETENEK PROFİLİ</p>
              <p className="lead">
                Ürettikleriniz, öğrendikleriniz ve katkılarınız.
                <br />
                Zaman içinde gelişen profesyonel hikâyeniz.
              </p>
            </div>
            <Link className="button" href="/aday#experiences">
              Deneyim ekle
            </Link>
          </header>
          <ProfileView
            key={data.candidate.id}
            candidateId={data.candidate.id}
          />
        </>
      ) : (
        <Empty
          title="Profiliniz için bir başlangıç"
          href="/aday"
          action="Profil oluştur"
        >
          Projelerinizi ve deneyimlerinizi ekleyin; zaman çizelgeniz ve
          kaynaklarınız burada bir araya gelsin.
        </Empty>
      )}
    </>
  );
}

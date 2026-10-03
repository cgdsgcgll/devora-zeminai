"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { PageHeader, Notes } from "@/components/ui";
import { LoadingState } from "@/components/feedback";
import {
  provenanceLabels,
  participationLabels,
  sourceLabels,
  safeProfileSource,
} from "@/lib/profile";

function ProfileView({ candidateId }: { candidateId: string }) {
  const [section, setSection] = useState("Özet");
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
      <nav className="view-switch" aria-label="Profil bölümleri">
        {["Özet", "Yetenek Haritası", "Zaman Çizelgesi", "Kanıt Pasaportu"].map(
          (label) => (
            <button
              className="button secondary"
              key={label}
              aria-pressed={section === label}
              onClick={() => setSection(label)}
            >
              {label}
            </button>
          ),
        )}
      </nav>
      <p className="small">
        Kayıt sayıları kalite veya yetenek puanı değildir. Bağlantı, beyan ve
        gözlem ayrı gösterilir.
      </p>
      <button
        className="text-button"
        disabled={!data && !error}
        onClick={() => setRetry((v) => v + 1)}
      >
        Kayıtları yenile
      </button>
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
      {!data && !error && <LoadingState label="Profil yükleniyor…" />}
      {data && (
        <section aria-label={section} className="result-section">
          {section === "Özet" && (
            <>
              <h2>Profil Özeti</h2>
              <div className="fact-grid">
                {data.summary.map((f) => (
                  <article className="panel" key={f.label}>
                    <strong className="fact-count">{f.count}</strong>
                    <p>{f.label}</p>
                  </article>
                ))}
              </div>
              <p>
                <Link className="button secondary" href="/aday#experiences">
                  + Deneyim ekle veya düzenle
                </Link>
              </p>
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

              {!data.timeline.length && <p>Bu aralıkta kayıt bulunmuyor.</p>}
              <ol className="talent-timeline">
                {data.timeline.map((item, i) => {
                  const source = safeProfileSource(item.source_url);
                  const month = item.date.slice(0, 7);
                  return (
                    <li key={item.id}>
                      {(i === 0 ||
                        data.timeline[i - 1].date.slice(0, 7) !== month) && (
                        <h3>{month}</h3>
                      )}
                      <article className="evidence-card">
                        <p className="eyebrow">
                          {sourceLabels[item.category] || item.category} ·{" "}
                          <time dateTime={item.date}>{item.date}</time>
                        </p>
                        <h3>{item.title}</h3>
                        <p>{provenanceLabels[item.status]}</p>
                        {item.date_basis === "recorded_at" && (
                          <p className="small">
                            Sisteme eklenme tarihi; deneyimin gerçekleşme tarihi
                            belirtilmedi.
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
                            <span className="sr-only"> (yeni sekmede)</span>
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
                Beyan: kullanıcı kaydı. Bağlantı: kaynak adresi var, içeriği
                doğrulanmadı. Gözlem: repo verisindeki teknik dayanak.
                Doğrulanmış: bağımsız provider doğrulaması; bu demoda
                uygulanmadı.
              </p>
              <div className="fact-grid">
                {data.passport.map((f) => (
                  <article className="panel" key={`${f.family}:${f.status}`}>
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
        </section>
      )}
    </>
  );
}

export default function LivingProfilePage() {
  const { data, ready } = useSession();
  return (
    <>
      <PageHeader
        step="YAŞAYAN YETENEK PROFİLİ"
        title="Üretim, öğrenme ve katkı; zaman içinde."
      >
        Ne ürettiğinizi, ne öğrendiğinizi ve nerelerde katkı verdiğinizi gerçek
        kayıtlarınız üzerinden inceleyin.
      </PageHeader>
      {!ready ? (
        <p role="status">Seçim yükleniyor…</p>
      ) : data.candidate ? (
        <>
          <h2>{data.candidate.name}</h2>
          <ProfileView
            key={data.candidate.id}
            candidateId={data.candidate.id}
          />
        </>
      ) : (
        <p>
          <Link href="/aday">Önce bir aday oluşturun</Link> veya{" "}
          <Link href="/kesif">keşiften bir profil seçin.</Link>
        </p>
      )}
    </>
  );
}

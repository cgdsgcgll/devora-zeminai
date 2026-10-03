"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { PageHeader, Notes, Empty } from "@/components/ui";
import { LoadingState } from "@/components/feedback";
import { sourceLabels, provenanceLabels } from "@/lib/profile";

function Sources({ items }: { items: Model<"EvidenceReference">[] }) {
  return (
    <ul>
      {items.map((s) => (
        <li key={`${s.family}:${s.status}`}>
          {sourceLabels[s.family] || s.family} ·{" "}
          {provenanceLabels[s.status] || s.status} · {s.count} kayıt
        </li>
      ))}
    </ul>
  );
}

function DiscoveryView({
  needId,
  anonymous,
}: {
  needId: string;
  anonymous: boolean;
}) {
  const session = useSession();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: Model<"Discovery">;
    error?: string;
  }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [team, setTeam] = useState<Model<"TeamCoverage">>();
  const key = `${offset}:${retry}`;
  useEffect(() => {
    let active = true;
    api
      .discovery(needId, anonymous, offset)
      .then((data) => {
        if (active) setResponse({ key, data });
      })
      .catch((e) => {
        if (active) setResponse({ key, error: userError(e) });
      });
    return () => {
      active = false;
    };
  }, [needId, anonymous, offset, key]);
  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;
  const busy = !!session.busy;
  return (
    <>
      <div className="view-switch">
        <button
          className="button secondary"
          disabled={busy || (!data && !error)}
          onClick={() => {
            setRetry((v) => v + 1);
            setTeam(undefined);
          }}
        >
          Keşfi yenile
        </button>
        <button
          className="button"
          disabled={busy || selected.length < 2}
          onClick={() =>
            void session.act("Takım kapsamı hesaplanıyor…", async () =>
              setTeam(await api.team(needId, selected, anonymous)),
            )
          }
        >
          Takım görünümü ({selected.length}/4)
        </button>
      </div>
      <p className="small">
        Takım için 2–4 aday seçin. Seçim veya sayfa değişince takım sonucu
        temizlenir. Sonuç güncel kayıtlardan hesaplanır.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <LoadingState label="Adayların kanıt kapsamı yükleniyor…" skeleton />
      )}
      {data && (
        <>
          <details className="disclosure">
            <summary>Sıralama nasıl yapılır?</summary>
            <p className="small">{data.ordering}</p>
          </details>
          {!data.candidates.length && (
            <Empty
              title="Henüz gösterilecek aday yok"
              href="/aday"
              action="Aday profili oluştur"
            >
              Proje veya deneyim kayıtları ekleyerek bu ihtiyaca ilişkin kanıt
              kapsamını inceleyebilirsiniz.
            </Empty>
          )}
          <div className="discovery-grid">
            {data.candidates.map((candidate) => (
              <article className="panel" key={candidate.candidate_id}>
                <h2>{candidate.label}</h2>
                <label className="team-select">
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.candidate_id)}
                    disabled={
                      busy ||
                      (!selected.includes(candidate.candidate_id) &&
                        selected.length >= 4)
                    }
                    onChange={(e) => {
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, candidate.candidate_id]
                          : ids.filter((id) => id !== candidate.candidate_id),
                      );
                      setTeam(undefined);
                    }}
                  />{" "}
                  Takıma seç: {candidate.label}
                </label>
                <p className="discovery-score">
                  Kanıt Uyumu{" "}
                  <strong>{Number(candidate.score.toFixed(2))}/100</strong>
                </p>
                <p>
                  Gerekli kapsam: %
                  {Math.round(candidate.required_coverage * 100)} · Tercih
                  edilen kapsam: %
                  {Math.round(candidate.preferred_coverage * 100)}
                </p>
                <div className="criterion-preview" aria-label="Kriter özeti">
                  <p>
                    <strong>Dayanak bulunan</strong>
                    {candidate.criteria
                      .filter((c) => c.matched)
                      .map((c) => c.label)
                      .join(" · ") || "Henüz karşılanan kriter yok"}
                  </p>
                  <p>
                    <strong>Henüz karşılanmayan</strong>
                    {candidate.criteria
                      .filter((c) => !c.matched)
                      .map((c) => c.label)
                      .join(" · ") || "Tüm kriterler karşılandı"}
                  </p>
                </div>
                <details>
                  <summary>Kriterler ve kaynak aileleri</summary>
                  {candidate.criteria.map((c) => (
                    <section className="criterion" key={c.criterion_id}>
                      <h3>{c.label}</h3>
                      <p>
                        {c.matched
                          ? "Dayanak bulundu"
                          : "Bu kriteri karşılayan yeterli dayanak yok"}{" "}
                        ·{" "}
                        {c.priority === "required"
                          ? "Gerekli"
                          : "Tercih edilen"}
                      </p>
                      <p className="small">
                        {sourceLabels[c.family] || c.family}
                      </p>
                      <Sources items={c.sources} />
                    </section>
                  ))}
                </details>
                {!anonymous && (
                  <div className="profile-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void session.act("Profil açılıyor…", async () => {
                          session.saveCandidate(
                            await api.candidate(candidate.candidate_id),
                          );
                          router.push("/profil");
                        })
                      }
                    >
                      Profili incele
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void session.act("Eşleşme hesaplanıyor…", async () => {
                          const match = await api.createMatch({
                            candidate_id: candidate.candidate_id,
                            need_id: needId,
                          });
                          session.saveCandidate(
                            await api.candidate(candidate.candidate_id),
                          );
                          session.saveMatch(match);
                          router.push("/eslesme");
                        })
                      }
                    >
                      Eşleşme ve boşluklar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="view-switch">
            <button
              className="button secondary"
              disabled={busy || offset === 0}
              onClick={() => {
                setOffset((v) => Math.max(0, v - 20));
                setSelected([]);
                setTeam(undefined);
              }}
            >
              Önceki adaylar
            </button>
            <button
              className="button secondary"
              disabled={busy || !data.has_more}
              onClick={() => {
                setOffset((v) => v + 20);
                setSelected([]);
                setTeam(undefined);
              }}
            >
              Sonraki adaylar
            </button>
          </div>
          <Notes title="Değerlendirmenin sınırları" items={data.limitations} />
        </>
      )}
      {team && (
        <section className="result-section" aria-live="polite">
          <h2>Takım Kanıt Kapsamı</h2>
          <p className="lead">
            {team.matched_count} / {team.total_count} kriter
          </p>
          <p>
            Gerekli kapsam: %{Math.round(team.required_coverage * 100)} · Tercih
            edilen kapsam: %{Math.round(team.preferred_coverage * 100)}
          </p>
          {team.criteria.map((c) => (
            <article className="criterion" key={c.criterion_id}>
              <h3>{c.label}</h3>
              {!c.supporters.length && (
                <p>
                  Seçilen adayların mevcut kayıtlarında bu kriter için kanıt
                  bulunamadı.
                </p>
              )}
              {c.supporters.map((s) => (
                <div key={s.candidate_id}>
                  <strong>{s.label}</strong>
                  <Sources items={s.sources} />
                </div>
              ))}
            </article>
          ))}
          <Notes title="Takım görünümünün sınırları" items={team.limitations} />
        </section>
      )}
    </>
  );
}

export default function DiscoveryPage() {
  const { data, ready, busy } = useSession();
  const [anonymous, setAnonymous] = useState(true);
  return (
    <>
      <PageHeader
        step="KURUM / ADAY KEŞFİ"
        title="İhtiyacınıza ilişkin kanıtları keşfedin."
      >
        Adayları bu ihtiyaca ilişkin kriter kapsamıyla inceleyin. Genel yetenek
        sıralaması değildir.
      </PageHeader>
      {!ready ? (
        <p role="status">İhtiyaç yükleniyor…</p>
      ) : !data.need?.criteria.length ? (
        <Empty
          title="Keşif, net bir ihtiyaçla başlar"
          href="/ihtiyac"
          action="İhtiyaç tanımla"
        >
          Gerekli ve tercih ettiğiniz kriterleri belirtin; ilgili aday
          dayanaklarını burada inceleyin.
        </Empty>
      ) : (
        <>
          <p className="callout">
            Seçili ihtiyaç: {data.need.description}{" "}
            <Link href="/ihtiyac">İhtiyacı değiştir →</Link>
          </p>
          <label className="team-select">
            <input
              type="checkbox"
              checked={anonymous}
              disabled={!!busy}
              onChange={(e) => setAnonymous(e.target.checked)}
            />{" "}
            Kanıt odaklı görünüm
          </label>
          <details className="disclosure">
            <summary>Kanıt odaklı görünüm neyi değiştirir?</summary>
            <p>
              İsimler ve kimlik içerebilen kaynak metinleri gizlenir. Tam
              anonimlik ya da tarafsızlık garantisi verilmez; kriter kapsamı
              aynı kalır.
            </p>
          </details>
          <DiscoveryView
            key={`${data.need.id}:${anonymous}`}
            needId={data.need.id}
            anonymous={anonymous}
          />
        </>
      )}
    </>
  );
}

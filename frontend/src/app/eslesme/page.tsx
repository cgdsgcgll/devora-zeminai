"use client";
import { api } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { Empty, PageHeader } from "@/components/ui";
import { MatchResult } from "@/components/match-result";
export default function MatchPage() {
  const s = useSession();
  const { candidate, need, run, match } = s.data;
  return (
    <>
      <PageHeader step="03 / EŞLEŞME" title="Uyumu, dayanaklarıyla görün.">
        Bir puanla yetinmeyin. Hangi beklentinin hangi proje kanıtıyla
        karşılandığını inceleyin.
      </PageHeader>
      {!candidate || !run ? (
        <Empty
          title="Önce proje kanıtlarını hazırlayın"
          href="/aday"
          action="Aday & Projeye git"
        >
          Eşleşme için bir aday ve tamamlanmış proje analizi gerekiyor.
        </Empty>
      ) : !need?.criteria.length ? (
        <Empty
          title="Kurum kriterleri gerekiyor"
          href="/ihtiyac"
          action="İhtiyacı tanımla"
        >
          Gerekli ve tercih edilen becerileri belirleyerek değerlendirmeyi
          başlatın.
        </Empty>
      ) : (
        <section className="match-toolbar">
          <div>
            <span className="eyebrow">ADAY</span>
            <strong>{candidate.name}</strong>
          </div>
          <span className="connection" aria-hidden="true">
            ↔
          </span>
          <div>
            <span className="eyebrow">KURUM İHTİYACI</span>
            <strong>{need.target_role || "Tanımlanan ihtiyaç"}</strong>
            <span className="small">{need.criteria.length} kriter</span>
          </div>
          <button
            className="button"
            disabled={!s.ready || !!s.busy}
            onClick={() =>
              void s.act("Kanıta dayalı eşleşme hesaplanıyor…", async () =>
                s.saveMatch(
                  await api.createMatch({
                    candidate_id: candidate.id,
                    need_id: need.id,
                  }),
                ),
              )
            }
          >
            {match ? "Eşleşmeyi Yenile" : "Eşleşmeyi Hesapla"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      )}
      {match && <MatchResult key={match.id} result={match} />}
    </>
  );
}

"use client";
import { api } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { Empty, PageHeader } from "@/components/ui";
import { MatchResult } from "@/components/match-result";
import { ProcessingState, ButtonProgress } from "@/components/feedback";
export default function MatchPage() {
  const s = useSession();
  const { candidate, need, match } = s.data;
  return (
    <div className="match-page">
      <PageHeader
        step="AÇIKLANABİLİR EŞLEŞME"
        title="Uyumu, dayanaklarıyla görün."
      >
        Bir puanla yetinmeyin. Hangi beklentinin hangi kaynakla karşılandığını
        inceleyin.
      </PageHeader>
      {!s.ready ? null : !candidate ? (
        <Empty
          title="Önce aday profilini hazırlayın"
          href="/aday"
          action="Aday & Projeye git"
        >
          Eşleşme için bir aday ve proje analizi veya profil kaydı gerekiyor.
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
            <ButtonProgress active={!!s.busy} />
            {s.busy
              ? "Eşleşme hesaplanıyor…"
              : match
                ? "Eşleşmeyi yenile"
                : "Eşleşmeyi hesapla"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      )}
      {s.busy.includes("eşleşme") && <ProcessingState kind="match" />}
      {match && <MatchResult key={match.id} result={match} />}
    </div>
  );
}

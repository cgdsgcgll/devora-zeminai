"use client";
import { useEffect, useState } from "react";
import { api, userError, type Match, type Evidence } from "@/lib/api/client";
import { scoreLabel, scoreExplanation } from "@/lib/presentation";
import { EvidenceCard, Notes } from "./ui";
export function MatchResult({ result }: { result: Match }) {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all(
      [...new Set(result.matched_criteria.flatMap((c) => c.evidence_ids))].map(
        api.evidence,
      ),
    )
      .then((items) => {
        if (active) {
          setEvidence(items);
          setLoading(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(userError(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [result, retry]);
  return (
    <section className="result-section">
      <div className="score-layout">
        <div className="score-card">
          <p className="eyebrow">{scoreLabel}</p>
          <p className="score">
            {Number(result.score.toFixed(2))}
            <span>/ 100</span>
          </p>
          <p>{scoreExplanation}</p>
          <span className="score-footnote">
            İşe alınma olasılığı veya genel yetenek puanı değildir.
          </span>
        </div>
        <div className="score-detail">
          <p className="eyebrow">SKORUN DAYANAĞI</p>
          <h2>
            Her kriterin <br />
            bir karşılığı var.
          </h2>
          <div className="coverage">
            <span>Gerekli kriter kapsamı</span>
            <strong>%{Math.round(result.required_coverage * 100)}</strong>
          </div>
          <div className="coverage">
            <span>Tercih edilen kriter kapsamı</span>
            <strong>%{Math.round(result.preferred_coverage * 100)}</strong>
          </div>
          <p className="small">
            Kriter bulunmayan grubun kapsamı 0 olarak gösterilir ve skora katkı
            yapmaz.
          </p>
          <details>
            <summary>Hesaplama ayrıntıları</summary>
            <p>{result.score_explanation}</p>
            <p className="meta">
              Skor sürümü: {result.scoring_version}
              <br />
              Analiz sürümü: {result.analysis_version}
            </p>
          </details>
        </div>
      </div>
      <div className="criteria-grid match-criteria">
        <section>
          <h2>
            Karşılanan kriterler{" "}
            <span className="count">{result.matched_criteria.length}</span>
          </h2>
          {!result.matched_criteria.length && (
            <p className="muted">Henüz kanıtla karşılanan kriter yok.</p>
          )}
          {result.matched_criteria.map((c) => (
            <article className="criterion" key={c.criterion_id}>
              <div className="card-heading">
                <h3>{c.skill_label}</h3>
                <span className="badge observed">
                  {c.priority === "required" ? "Gerekli" : "Tercih edilen"}
                </span>
              </div>
              <p>{c.explanation}</p>
              <div className="evidence-links">
                {c.evidence_ids.map((id, i) => (
                  <a href={`#evidence-${id}`} key={id}>
                    Kanıt {i + 1} ↗
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>
        <section>
          <h2>
            Kanıt bulunamayan kriterler{" "}
            <span className="count">{result.unmatched_criteria.length}</span>
          </h2>
          {!result.unmatched_criteria.length && (
            <p className="muted">
              Tüm kriterler gözlemlenen kanıtlarla karşılandı.
            </p>
          )}
          {result.unmatched_criteria.map((c) => (
            <article className="criterion missing" key={c.criterion_id}>
              <div className="card-heading">
                <h3>{c.skill_label}</h3>
                <span className="badge">
                  {c.priority === "required" ? "Gerekli" : "Tercih edilen"}
                </span>
              </div>
              <p>{c.explanation}</p>
            </article>
          ))}
        </section>
      </div>
      <Notes title="Güçlü yönler" items={result.strengths} />
      <Notes title="Kanıt kapsamındaki eksikler" items={result.gaps} />
      <Notes title="Belirsizlikler" items={result.uncertainties} />
      <section className="result-section">
        <div className="section-heading">
          <p className="eyebrow">KAYNAĞINA İNİN</p>
          <h2>Eşleşmeyi destekleyen kanıtlar</h2>
        </div>
        {loading && <p role="status">Kanıt kayıtları yükleniyor…</p>}
        {error && (
          <div className="error" role="alert">
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => {
                setLoading(true);
                setRetry((v) => v + 1);
              }}
            >
              Kanıtları yeniden yükle
            </button>
          </div>
        )}
        <div className="evidence-grid">
          {evidence.map((item) => (
            <div id={`evidence-${item.id}`} key={item.id}>
              <EvidenceCard item={item} />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

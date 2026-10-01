"use client";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";

export function EvidenceGaps({ matchId }: { matchId: string }) {
  const [response, setResponse] = useState<Model<"GapSummary">>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .gaps(matchId)
      .then((data) => {
        if (active) {
          setResponse(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(userError(e));
      });
    return () => {
      active = false;
    };
  }, [matchId, retry]);
  return (
    <section className="result-section">
      <h2>Gelişim / Kanıt Boşlukları</h2>
      <p>
        Eksik kanıt, eksik beceri anlamına gelmez. Öneriler yalnız mevcut
        deneyiminizi görünür kılmak içindir.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            Yeniden yükle
          </button>
        </div>
      )}
      {!response && !error && <p role="status">Kanıt boşlukları yükleniyor…</p>}
      {response?.items
        .filter((item) => item.state !== "strength")
        .map((item) => (
          <article className="criterion missing" key={item.criterion_id}>
            <h3>
              {item.label} ·{" "}
              {item.priority === "required" ? "Gerekli" : "Tercih edilen"}
            </h3>
            <p>{item.explanation}</p>
            <p>{item.next_step}</p>
          </article>
        ))}
      {response &&
        response.items.every((item) => item.state === "strength") && (
          <p>Bu sonuçtaki tüm kriterler için dayanak bulundu.</p>
        )}
    </section>
  );
}

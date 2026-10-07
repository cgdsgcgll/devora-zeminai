"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import type { Model } from "@/lib/api/client";
import { sourceLabels, provenanceLabels } from "@/lib/profile";
export function Sources({ items }: { items: Model<"EvidenceReference">[] }) {
  useLocale();

  return (
    <ul>
      {items.map((s) => (
        <li key={`${s.family}:${s.status}`}>
          {sourceLabels[s.family] || s.family} ·{" "}
          {provenanceLabels[s.status] || s.status} · {s.count}
          {t("m116")}
        </li>
      ))}
    </ul>
  );
}

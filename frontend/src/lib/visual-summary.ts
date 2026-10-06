"use client";
import { t, tx } from "../i18n/index.ts";
import type { Model } from "./api/client";
import { categoryLabels } from "./profile.ts";
/** Display-only counts. Never infer a proficiency or a score from record totals. */
export function profileHighlights(summary: Model<"LivingProfile">["summary"]) {
  const find = (label: string) =>
    summary.find((item) => tx(item.label) === label)?.count ?? 0;
  return [
    { label: t("m216"), count: find(t("m216")) },
    {
      label: t("m217"),
      count: find(t("m217")),
    },
    {
      label: t("m218"),
      count: Object.values(categoryLabels).reduce(
        (total, label) => total + find(label),
        0,
      ),
    },
  ];
}
/** Summarize server-provided criteria without sorting or changing matching semantics. */
export function discoveryPreview(
  criteria: { matched: boolean; label: string }[],
) {
  return {
    signals: criteria
      .filter((c) => c.matched)
      .slice(0, 3)
      .map((c) => c.label),
    missing: criteria.filter((c) => !c.matched).length,
  };
}

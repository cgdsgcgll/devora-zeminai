"use client";
import { localized, t, tx, interpolate } from "../i18n/index.ts";
export const statusLabels = localized({
  observed: "m433",
  declared_only: "m434",
  not_found: "m133",
});
export const strengthLabels = localized({
  weak: "m435",
  medium: "m436",
  strong: "m437",
});
export const typeLabels = localized({
  project_description: "m381",
  readme: "m438",
  source_file: "m439",
  dependency_file: "m440",
  repository_language: "m441",
  user_claim: "m442",
});
export const scoreLabel = "Kanıt Uyumu";
export function presentationNote(value: string): string {
  const known: Record<string, string> = {
    "Repository-level evidence; individual authorship not verified. Repo bağlantısı adayın kodu yazdığını doğrulamaz.":
      t("m444"),
    "Contributor doğrulaması yok; repository kodunun aday tarafından yazıldığı varsayılmaz.":
      t("m446"),
  };
  return known[value] || tx(value);
}
export function actionSuccess(label: string): string {
  const messages: Record<string, string> = {
    [tx("Aday oluşturuluyor…")]: t("m447"),
    [tx("Proje oluşturuluyor…")]: t("m448"),
    [tx("Proje analiz ediliyor…")]: t("m449"),
    [tx("İhtiyaç kriterleri hazırlanıyor…")]: t("m450"),
    [tx("Kanıta dayalı eşleşme hesaplanıyor…")]: t("m452"),
    [tx("Profil kaydı kaydediliyor…")]: t("m453"),
    [tx("Profil kaydı siliniyor…")]: t("m454"),
    [tx("Takım kapsamı hesaplanıyor…")]: t("m455"),
  };
  return messages[tx(label)] || t("m456");
}
export const technicalScoreExplanation =
  "Yalnızca gözlemlenen teknik kanıtlar teknik kriter kapsamına dahil edilir. README beyanları teknik eşleşme skoruna dahil edilmez.";
export function evidenceExplanation(status: keyof typeof statusLabels): string {
  return status === "declared_only"
    ? t("m458")
    : status === "observed"
      ? t("m459")
      : t("m460");
}
export function criterionExplanation(priority: string): string {
  return priority === "required" ? t("m461") : t("m462");
}
export const scoreExplanation =
  "Bu skor, mevcut kurum ihtiyacı ile erişilebilen proje kanıtlarının uyumunu gösterir.";
export function safeSource(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function validateName(value: string, label: string): string | undefined {
  return !value.trim()
    ? interpolate("nameRequired", { name: label })
    : value.trim().length > 200
      ? interpolate("nameLong", { name: label })
      : undefined;
}
export function validateGithub(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      safeSource(value) &&
      /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    )
      return;
  } catch {}
  return t("m464");
}
export function validateNeed(value: string): string | undefined {
  return !value.trim()
    ? t("m465")
    : value.trim().length > 20000
      ? t("m466")
      : undefined;
}

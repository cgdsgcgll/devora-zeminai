export const statusLabels = {
  observed: "Gözlemlenen kanıt",
  declared_only: "Yalnızca beyan",
  not_found: "Kanıt bulunamadı",
};
export const strengthLabels = {
  weak: "Zayıf kanıt",
  medium: "Orta güçte kanıt",
  strong: "Güçlü kanıt",
};
export const typeLabels = {
  project_description: "Proje açıklaması",
  readme: "README",
  source_file: "Kaynak dosya",
  dependency_file: "Bağımlılık dosyası",
  repository_language: "Depo dili",
  user_claim: "Kullanıcı beyanı",
};
export const scoreLabel = "Kanıt Uyumu";
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
    ? `${label} gerekli.`
    : value.trim().length > 200
      ? `${label} en fazla 200 karakter olabilir.`
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
  return "https://github.com/sahip/depo biçiminde herkese açık bir GitHub deposunun adresini girin.";
}
export function validateNeed(value: string): string | undefined {
  return !value.trim()
    ? "İhtiyaç açıklaması gerekli."
    : value.trim().length > 20000
      ? "Açıklama en fazla 20000 karakter olabilir."
      : undefined;
}

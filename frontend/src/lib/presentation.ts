export const statusLabels = {
  observed: "Gözlemlenen kullanım",
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
export function presentationNote(value: string): string {
  const known: Record<string, string> = {
    "Repository-level evidence; individual authorship not verified. Repo bağlantısı adayın kodu yazdığını doğrulamaz.":
      "Kanıtlar proje düzeyindedir. Proje bağlantısı, kodun aday tarafından yazıldığını doğrulamaz.",
    "Contributor doğrulaması yok; repository kodunun aday tarafından yazıldığı varsayılmaz.":
      "Katkı sahipliği doğrulanmadı; proje kodunun aday tarafından yazıldığı varsayılmaz.",
  };
  return known[value] || value;
}
export function actionSuccess(label: string): string {
  const messages: Record<string, string> = {
    "Aday oluşturuluyor…":
      "Aday kaydedildi. Şimdi proje veya deneyim ekleyebilirsiniz.",
    "Proje oluşturuluyor…":
      "Proje kaydedildi. Kanıtları incelemek için projeyi analiz edin.",
    "Proje analiz ediliyor…":
      "Proje analizi tamamlandı. Beceri sinyalleri ve kanıtlar hazır.",
    "İhtiyaç kriterleri hazırlanıyor…":
      "İhtiyaç yapılandırıldı. Eşleşmeden önce kriterleri inceleyebilirsiniz.",
    "Kanıta dayalı eşleşme hesaplanıyor…":
      "Eşleşme hesaplandı. Kriterleri ve dayanaklarını aşağıda inceleyebilirsiniz.",
    "Profil kaydı kaydediliyor…":
      "Deneyim kaydedildi. Güncel sonuç için eşleşmeyi yeniden hesaplayın.",
    "Profil kaydı siliniyor…":
      "Deneyim silindi. Önceki eşleşme kayıtları korundu.",
    "Takım kapsamı hesaplanıyor…": "Takımın kriter kapsamı hesaplandı.",
  };
  return messages[label] || "İşlem tamamlandı. Güncel sonuçlar hazır.";
}
export const technicalScoreExplanation =
  "Yalnızca gözlemlenen teknik kanıtlar teknik kriter kapsamına dahil edilir. README beyanları teknik eşleşme skoruna dahil edilmez.";
export function evidenceExplanation(status: keyof typeof statusLabels): string {
  return status === "declared_only"
    ? "Bu kayıt yalnızca beyan niteliğindedir. Teknik eşleşme skoruna dahil edilmez."
    : status === "observed"
      ? "Erişilebilen proje verisinde teknik kullanım gözlemlendi. Bu, bireysel uzmanlık veya yazarlık doğrulaması değildir."
      : "Erişilebilen proje verisinde yeterli teknik kullanım kanıtı bulunamadı.";
}
export function criterionExplanation(priority: string): string {
  return priority === "required"
    ? "İhtiyaç metninde gerekli olarak belirtilen kriter."
    : "İhtiyaç metninde tercih edilen kriter.";
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

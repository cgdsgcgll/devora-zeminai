export type Role = "candidate" | "institution";
export function homeFor(role: Role) {
  return role === "candidate" ? "/profil" : "/ihtiyac";
}
export function linksFor(role?: Role) {
  return role === "candidate"
    ? [
        ["/profil", "Profil"],
        ["/aday", "Projelerim"],
      ]
    : role === "institution"
      ? [
          ["/ihtiyac", "İhtiyaçlar"],
          ["/kesif", "Keşif"],
          ["/eslesme", "Eşleşme"],
        ]
      : [];
}
export function routeRole(path: string): Role | undefined {
  if (["/aday", "/profil"].includes(path)) return "candidate";
  if (["/ihtiyac", "/kesif", "/eslesme"].includes(path)) return "institution";
}
export function authValidation(email: string, password: string, name?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Geçerli bir e-posta adresi girin.";
  if (!password || password.length > 128)
    return "Parola 1–128 karakter olmalı.";
  if (name !== undefined && (!name.trim() || name.trim().length > 200))
    return "Ad 1–200 karakter olmalı.";
  if (name !== undefined && password.length < 12)
    return "En az 12 karakterli bir parola kullanın.";
  return "";
}

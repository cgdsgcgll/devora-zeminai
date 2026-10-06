"use client";
import { t } from "../i18n/index.ts";
export type Role = "candidate" | "institution";
export function homeFor(role: Role) {
  return role === "candidate" ? "/profil" : "/ihtiyac";
}
export function linksFor(role?: Role) {
  return role === "candidate"
    ? [
        ["/profil", t("m425")],
        ["/aday", t("m426")],
        ["/kanit-istekleri", t("m298")],
      ]
    : role === "institution"
      ? [
          ["/ihtiyac", t("m427")],
          ["/kesif", t("m428")],
          ["/eslesme", t("m185")],
          ["/kanit-istekleri", t("m298")],
        ]
      : [];
}
export function routeRole(path: string): Role | undefined {
  if (["/aday", "/profil"].includes(path)) return "candidate";
  if (["/ihtiyac", "/kesif", "/eslesme"].includes(path)) return "institution";
}
export function authValidation(email: string, password: string, name?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return t("m429");
  if (!password || password.length > 128) return t("m430");
  if (name !== undefined && (!name.trim() || name.trim().length > 200))
    return t("m431");
  if (name !== undefined && password.length < 12) return t("m432");
  return "";
}

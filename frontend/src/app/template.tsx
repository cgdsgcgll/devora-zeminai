"use client";

import { useLocale } from "../i18n/react";
import type { ReactNode } from "react";

/** App Router remounts this boundary; the header and session remain in layout. */
export default function Template({ children }: { children: ReactNode }) {
  useLocale();

  return <div className="page-enter">{children}</div>;
}

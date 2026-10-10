export const activeAnalysis = (state: string) =>
  state === "queued" || state === "analyzing";

/** One owner/one timer, no overlapping loads; cleanup ignores late replies. */
export function watchProjects<
  T extends { analysis: { state: string } },
>(options: {
  load: () => Promise<T[]>;
  publish: (rows: T[]) => void;
  error: (error: unknown, paused: boolean) => void;
  schedule?: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let loading = false;
  const schedule = options.schedule || setTimeout;
  const cancel = options.cancel || clearTimeout;
  async function poll() {
    if (!live || loading) return;
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
    loading = true;
    try {
      const rows = await options.load();
      if (!live) return;
      failures = 0;
      options.publish(rows);
      if (rows.some((row) => activeAnalysis(row.analysis.state)))
        timer = schedule(() => {
          void poll();
        }, 1500);
    } catch (error) {
      if (!live) return;
      failures++;
      options.error(error, failures >= 3);
      if (failures < 3)
        timer = schedule(() => {
          void poll();
        }, 1500);
    } finally {
      loading = false;
    }
  }
  const refresh = () => {
    if (
      typeof document === "undefined" ||
      document.visibilityState !== "hidden"
    )
      void poll();
  };
  if (typeof window !== "undefined")
    window.addEventListener?.("focus", refresh);
  if (typeof document !== "undefined")
    document.addEventListener?.("visibilitychange", refresh);
  void poll();
  return () => {
    live = false;
    if (typeof window !== "undefined")
      window.removeEventListener?.("focus", refresh);
    if (typeof document !== "undefined")
      document.removeEventListener?.("visibilitychange", refresh);
    if (timer !== undefined) cancel(timer);
  };
}

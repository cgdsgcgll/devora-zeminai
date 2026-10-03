"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  userError,
  type Candidate,
  type Project,
  type Need,
  type Match,
  type Evidence,
  type Model,
} from "@/lib/api/client";

type IDs = {
  candidate?: string;
  project?: string;
  need?: string;
  match?: string;
  run?: string;
  evidence?: string[];
};
type Data = {
  candidate?: Candidate;
  project?: Project;
  need?: Need;
  match?: Match;
  run?: Model<"AnalysisRun">;
  evidence: Evidence[];
};
const storageKey = "zeminai-demo-v1";
const empty: Data = { evidence: [] };
type Session = {
  data: Data;
  ready: boolean;
  busy: string;
  error: string;
  storageWarning: boolean;
  act: (label: string, task: () => Promise<void>) => Promise<void>;
  saveCandidate: (v: Candidate) => void;
  saveProject: (v: Project) => void;
  saveNeed: (v: Need) => void;
  saveAnalysis: (run: Model<"AnalysisRun">, evidence: Evidence[]) => void;
  saveMatch: (v: Match) => void;
  reset: () => void;
  restore: () => Promise<void>;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(empty);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const ids = useRef<IDs>({});
  const locked = useRef(false);
  const persist = (next: IDs) => {
    ids.current = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setStorageWarning(true);
    }
  };
  const restore = useCallback(async () => {
    setError("");
    setReady(false);
    const saved: IDs = {};
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const uuid =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      for (const key of [
        "candidate",
        "project",
        "need",
        "match",
        "run",
      ] as const)
        if (typeof raw?.[key] === "string" && uuid.test(raw[key]))
          saved[key] = raw[key];
      saved.evidence = Array.isArray(raw?.evidence)
        ? raw.evidence
            .filter((v: unknown) => typeof v === "string" && uuid.test(v))
            .slice(0, 100)
        : [];
    } catch {
      setStorageWarning(true);
    }
    ids.current = saved;
    try {
      const [candidate, project, need, match, run, evidence] =
        await Promise.all([
          saved.candidate ? api.candidate(saved.candidate) : undefined,
          saved.project ? api.project(saved.project) : undefined,
          saved.need ? api.need(saved.need) : undefined,
          saved.match ? api.match(saved.match) : undefined,
          saved.run ? api.run(saved.run) : undefined,
          Promise.all((saved.evidence || []).map(api.evidence)),
        ]);
      setData({ candidate, project, need, match, run, evidence });
    } catch (e) {
      setError(
        `Önceki demo yüklenemedi. ${userError(e)} Yeniden yükleyebilir veya yeni demo başlatabilirsiniz.`,
      );
    }
    setReady(true);
  }, []);
  // Browser-only ID storage is synchronized after hydration, never during SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);
  const act = async (label: string, task: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(`${userError(e)}${e instanceof ApiError ? ` (${e.code})` : ""}`);
    } finally {
      locked.current = false;
      setBusy("");
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        ready,
        busy,
        error,
        storageWarning,
        act,
        restore,
        saveCandidate: (candidate) => {
          persist({ candidate: candidate.id, need: ids.current.need });
          setData((d) => ({ candidate, need: d.need, evidence: [] }));
        },
        saveProject: (project) => {
          persist({
            candidate: ids.current.candidate,
            project: project.id,
            need: ids.current.need,
          });
          setData((d) => ({
            candidate: d.candidate,
            project,
            need: d.need,
            evidence: [],
          }));
        },
        saveNeed: (need) => {
          persist({ ...ids.current, need: need.id, match: undefined });
          setData((d) => ({ ...d, need, match: undefined }));
        },
        saveAnalysis: (run, evidence) => {
          persist({
            ...ids.current,
            run: run.id,
            evidence: evidence.map((e) => e.id),
            match: undefined,
          });
          setData((d) => ({ ...d, run, evidence, match: undefined }));
        },
        saveMatch: (match) => {
          persist({ ...ids.current, match: match.id });
          setData((d) => ({ ...d, match }));
        },
        reset: () => {
          if (locked.current) return;
          persist({});
          setData(empty);
          setError("");
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider required");
  return value;
}

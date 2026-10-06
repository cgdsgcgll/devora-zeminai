"use client";

import { useLocale } from "../i18n/react";

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
  subscribeUnauthorized,
  type Account,
  type Candidate,
  type Project,
  type Need,
  type Match,
  type Evidence,
  type Model,
} from "@/lib/api/client";
import { actionSuccess } from "@/lib/presentation";
type Data = {
  candidate?: Pick<Candidate, "id" | "name">;
  project?: Project;
  need?: Need;
  match?: Match;
  run?: Model<"AnalysisRun">;
  evidence: Evidence[];
};
const empty: Data = { evidence: [] };
type Session = {
  user?: Account;
  data: Data;
  ready: boolean;
  busy: string;
  error: string;
  success: string;
  dismissSuccess: () => void;
  act: (label: string, task: () => Promise<void>) => Promise<void>;
  restore: () => Promise<void>;
  authenticate: (state: Model<"AuthState">) => Promise<void>;
  logout: () => Promise<void>;
  saveCandidate: (v: Pick<Candidate, "id" | "name">) => void;
  saveProject: (v: Project) => void;
  saveNeed: (v: Need) => void;
  saveAnalysis: (run: Model<"AnalysisRun">, evidence: Evidence[]) => void;
  saveMatch: (v: Match) => void;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  useLocale();

  const [user, setUser] = useState<Account>();
  const [data, setData] = useState<Data>(empty);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  const actionGeneration = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    setUser(undefined);
    setData(empty);
    setSuccess("");
    setReady(true);
  }, []);
  const authenticate = useCallback(async (state: Model<"AuthState">) => {
    const ticket = ++generation.current;
    setReady(false);
    setData(empty);
    setUser(state.user);
    setError("");
    try {
      if (state.candidate) {
        const candidate = state.candidate as Candidate;
        const projects = await api.projects(candidate.id);
        const project = projects[0];
        const evidence = project ? await api.projectEvidence(project.id) : [];
        if (ticket === generation.current)
          setData({ candidate, project, evidence });
      } else {
        const needs = await api.needs();
        if (ticket === generation.current)
          setData({ need: needs[0], evidence: [] });
      }
    } catch (e) {
      if (ticket === generation.current) setError(userError(e));
    } finally {
      if (ticket === generation.current) setReady(true);
    }
  }, []);
  const restore = useCallback(async () => {
    const ticket = ++generation.current;
    setReady(false);
    setError("");
    try {
      const state = await api.me();
      if (ticket === generation.current) await authenticate(state);
    } catch (e) {
      if (ticket === generation.current) {
        clear();
        if (!(e instanceof ApiError && e.code === "UNAUTHENTICATED"))
          setError(userError(e));
      }
    }
  }, [authenticate, clear]);
  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(clear);
    // Bootstrap synchronizes account state with the cookie-backed remote session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
    return () => {
      unsubscribe();
    };
  }, [clear, restore]);
  const act = async (label: string, task: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    setSuccess("");
    const ticket = generation.current;
    actionGeneration.current = ticket;
    try {
      await task();
      if (ticket === generation.current) setSuccess(actionSuccess(label));
    } catch (e) {
      if (ticket === generation.current) setError(userError(e));
    } finally {
      locked.current = false;
      setBusy("");
    }
  };
  const save = (update: (data: Data) => Data) => {
    if (!locked.current || actionGeneration.current === generation.current)
      setData(update);
  };
  return (
    <Context.Provider
      value={{
        user,
        data,
        ready,
        busy,
        error,
        success,
        restore,
        authenticate,
        dismissSuccess: () => setSuccess(""),
        act,
        logout: async () => {
          await api.logout();
          clear();
        },
        saveCandidate: (candidate) => save((d) => ({ ...d, candidate })),
        saveProject: (project) =>
          save((d) => ({
            ...d,
            project,
            run: undefined,
            evidence: [],
            match: undefined,
          })),
        saveNeed: (need) => save((d) => ({ ...d, need, match: undefined })),
        saveAnalysis: (run, evidence) =>
          save((d) => ({ ...d, run, evidence, match: undefined })),
        saveMatch: (match) => save((d) => ({ ...d, match })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw Error("SessionProvider required");
  return value;
}

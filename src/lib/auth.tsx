import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, getToken, setToken } from "./api";
import type { AuthSession, Business, PublicUser } from "~shared/types";

interface AuthContextValue {
  user: PublicUser | null;
  business: Business | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthSession & { verification_url?: string }>;
  signUp: (
    input: { name: string; email: string; password: string; business_name?: string },
  ) => Promise<AuthSession & { verification_url?: string }>;
  signOut: () => void;
  refresh: () => Promise<void>;
  setBusiness: (business: Business) => void;
  setUser: (user: PublicUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [business, setBusinessState] = useState<Business | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));

  const applySession = useCallback((session: AuthSession) => {
    setToken(session.token);
    setUserState(session.user);
    setBusinessState(session.business ?? null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      setBusinessState(null);
      setLoading(false);
      return;
    }
    try {
      let session: AuthSession;
      try {
        session = await api.auth.me();
      } catch (error) {
        // Real auth failures are final; anything else (server restarting, brief
        // offline blip) gets one retry so a hiccup doesn't end the session.
        const rejected =
          error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (rejected) throw error;
        session = await api.auth.me();
      }
      setUserState(session.user);
      setBusinessState(session.business ?? null);
      setToken(session.token);
    } catch {
      setToken(null);
      setUserState(null);
      setBusinessState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setUserState(null);
      setBusinessState(null);
    };
    window.addEventListener("billflow:unauthorized", onUnauthorized);
    return () => window.removeEventListener("billflow:unauthorized", onUnauthorized);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await api.auth.login({ email, password });
      applySession(session);
      return session;
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: { name: string; email: string; password: string; business_name?: string }) => {
      const session = await api.auth.signup(input);
      applySession(session);
      return session;
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setUserState(null);
    setBusinessState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      business,
      loading,
      signIn,
      signUp,
      signOut,
      refresh,
      setBusiness: setBusinessState,
      setUser: setUserState,
    }),
    [user, business, loading, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

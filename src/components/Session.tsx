'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Me } from '@/lib/client';

type S = { me: Me; loaded: boolean; refresh: () => Promise<Me> };
const Ctx = createContext<S>({ me: null, loaded: false, refresh: async () => null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const r = await api<{ user: Me }>('/api/auth/me');
    const u = r.ok ? r.data.user ?? null : null;
    setMe(u);
    setLoaded(true);
    return u;
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ me, loaded, refresh }}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}

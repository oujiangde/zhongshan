import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { supabase } from '@/client/supabase';

type SessionContextType = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextType>({
  session: null,
  isLoading: true,
});

// 游客凭据存储 Key
const GUEST_CREDS_KEY = 'pdq_guest_creds_v1';

/** 带超时的 Promise 包装 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

/** 生成随机字符串 */
function randStr(len = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const initStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      if (initStarted.current) return;
      initStarted.current = true;

      try {
        // 1. 尝试取已有 session
        const sessionResult = await withTimeout(supabase.auth.getSession(), 5000);
        if (cancelled) return;
        const existing = sessionResult?.data?.session ?? null;
        if (existing) {
          setSession(existing);
          setIsLoading(false);
          return;
        }

        // 2. 尝试用存储的游客凭据登录
        let storedStr: string | null = null;
        try {
          storedStr = await SecureStore.getItemAsync(GUEST_CREDS_KEY);
        } catch { /* SecureStore 在 Web 上不可用，忽略 */ }

        if (storedStr) {
          try {
            const { email, password } = JSON.parse(storedStr);
            const { data } = await withTimeout(
              supabase.auth.signInWithPassword({ email, password }), 5000
            ) ?? { data: null };
            if (data?.session) {
              if (!cancelled) setSession(data.session);
              setIsLoading(false);
              return;
            }
          } catch { /* 凭据失效，继续注册新游客 */ }
        }

        // 3. 首次登录：自动注册游客账号
        const uid = randStr(12);
        const email = `guest_${uid}@pdq-guest.app`;
        const password = randStr(24);

        const signUpResult = await withTimeout(
          supabase.auth.signUp({ email, password }), 6000
        );
        if (cancelled) return;

        const newSession = signUpResult?.data?.session ?? null;
        if (newSession) {
          // 持久化凭据供下次登录
          try {
            await SecureStore.setItemAsync(GUEST_CREDS_KEY, JSON.stringify({ email, password }));
          } catch { /* Web 环境忽略 */ }
          setSession(newSession);
        }
      } catch {
        // 所有异常静默忽略，不卡界面
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
    });

    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (Platform.OS !== 'web' && appState.current.match(/inactive|background/) && nextState === 'active') {
        const { error } = await supabase.auth.refreshSession();
        if (error) await supabase.auth.signOut();
      }
      appState.current = nextState;
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

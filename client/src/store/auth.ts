import { create } from "zustand";
import { api } from "../lib/api";

export interface AuthUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  ready: boolean;
  init: () => Promise<void>;
}

// 游客即用:无 token 时自动创建游客账号;有 token 则恢复会话
export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("musicroom_token"),
  user: null,
  ready: false,
  init: async () => {
    try {
      let token = localStorage.getItem("musicroom_token");
      if (!token) {
        const r = await api<{ token: string; user: AuthUser }>(
          "/auth/guest",
          { method: "POST", body: JSON.stringify({}) }
        );
        token = r.token;
        localStorage.setItem("musicroom_token", token);
        set({ token, user: r.user, ready: true });
        return;
      }
      const me = await api<{ user: AuthUser }>("/auth/me");
      set({ token, user: me.user, ready: true });
    } catch {
      localStorage.removeItem("musicroom_token");
      set({ token: null, user: null, ready: true });
    }
  },
}));

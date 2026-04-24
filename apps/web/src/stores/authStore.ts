import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  guestLogin: (name: string) => Promise<void>;
  register: (name: string, email: string, password: string, role?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const result = await api.login(email, password);
    set({ user: result.user, isAuthenticated: true, isLoading: false });
  },

  guestLogin: async (name) => {
    const result = await api.guestLogin(name);
    set({ user: result.user, isAuthenticated: true, isLoading: false });
  },

  register: async (name, email, password, role) => {
    const result = await api.register(name, email, password, role);
    set({ user: result.user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    api.clearTokens();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.getProfile();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

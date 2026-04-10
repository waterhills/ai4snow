import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoggedIn: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateCredits: (credits: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isLoggedIn: !!localStorage.getItem('token'),

  login: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user, isLoggedIn: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null, isLoggedIn: false });
  },

  updateCredits: (credits) => {
    set((state) => {
      if (state.user) {
        const updated = { ...state.user, credits };
        localStorage.setItem('user', JSON.stringify(updated));
        return { user: updated };
      }
      return {};
    });
  },
}));

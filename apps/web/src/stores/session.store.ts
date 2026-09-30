import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeJwtPayload, DecodedStaffToken } from '@/utils/jwt';

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  principalType: 'STAFF' | 'CUSTOMER' | null;
  displayName: string | null;
  role: string | null;
  permissions: string[];
  outletIds: string[];
  setSession: (accessToken: string, refreshToken: string, principalType: 'STAFF' | 'CUSTOMER', displayName: string) => void;
  clearSession: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      principalType: null,
      displayName: null,
      role: null,
      permissions: [],
      outletIds: [],

      setSession: (accessToken, refreshToken, principalType, displayName) => {
        const decoded = principalType === 'STAFF' ? decodeJwtPayload<DecodedStaffToken>(accessToken) : null;
        set({
          accessToken,
          refreshToken,
          principalType,
          displayName,
          role: decoded?.role ?? null,
          permissions: decoded?.permissions ?? [],
          outletIds: decoded?.outletIds ?? [],
        });
      },

      clearSession: () =>
        set({ accessToken: null, refreshToken: null, principalType: null, displayName: null, role: null, permissions: [], outletIds: [] }),

      hasPermission: (permission: string) => get().permissions.includes(permission),
    }),
    { name: 'hcf-session' }
  )
);

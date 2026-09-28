import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StaffOutletState {
  activeOutletId: string | null;
  setActiveOutlet: (outletId: string) => void;
}

export const useStaffOutletStore = create<StaffOutletState>()(
  persist(
    (set) => ({
      activeOutletId: null,
      setActiveOutlet: (activeOutletId) => set({ activeOutletId }),
    }),
    { name: 'hfc-staff-outlet' }
  )
);

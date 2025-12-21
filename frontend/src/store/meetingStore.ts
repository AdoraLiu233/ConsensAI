import type { ReactNode } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware'

type MeetingState = {
  meetingId: string;
  meetingHashId: string;
  isHost: boolean;
  topic: string;
  hotwords: string[];
  type: 'graph' | 'document';
  meetingGoal: string;
  driftScore: number;
  driftReason: string;
  driftIntervention: string;
}

type UiState = {
  mobileOpened: boolean;
  desktopOpened: boolean;
}

const initialState: MeetingState = {
  meetingId: '',
  meetingHashId: '',
  isHost: false,
  topic: '',
  hotwords: [],
  type: 'graph',
  meetingGoal: '',
  driftScore: 0,
  driftReason: '',
  driftIntervention: '',
};

type AllState = MeetingState & UiState & {
  setMeeting: (m: Partial<MeetingState>) => void;
  setMeetingGoal: (goal: string) => void;
  setDriftInfo: (score: number, reason: string, intervention: string) => void;
  clearMeeting: () => void;
  hasMeeting: () => boolean;

  headerContent: ReactNode | null;
  setHeaderContent: (content: ReactNode) => void;

  toggleDesktop: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
}

export const useMeetingStore = create<AllState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // UI related
      mobileOpened: false,
      desktopOpened: true,

      setMeeting: (m) => set({ ...m }),
      setMeetingGoal: (goal) => set({ meetingGoal: goal }),
      setDriftInfo: (score, reason, intervention) => set({ driftScore: score, driftReason: reason, driftIntervention: intervention }),
      clearMeeting: () => set({ ...initialState }),
      hasMeeting: () => (get().meetingId !== ''),

      headerContent: null,
      setHeaderContent: (content: ReactNode) => set({ headerContent: content }),

      toggleDesktop: () => set({ desktopOpened: !get().desktopOpened }),
      closeMobile: () => set({ mobileOpened: false }),
      toggleMobile: () => set({ mobileOpened: !get().mobileOpened }),
    }),
    {
      name: 'meeting-store',
      partialize: (state) => ({
        // 仅持久化存储UI相关状态
        mobileOpened: state.mobileOpened,
        desktopOpened: state.desktopOpened,
      }),
    }
  )
);

import { create } from 'zustand';
import { CardItem } from '../lib/cards/cardEngine';

export interface GameAnimation {
  id: string;
  type: 'play' | 'draw';
  playerId: string;
  card?: CardItem;
  // Delay processing of state until animation finishes
  statePayload: any;
}

interface AnimationQueueState {
  activeAnimation: GameAnimation | null;
  queue: GameAnimation[];
  
  pushAnimation: (anim: GameAnimation) => void;
  completeCurrentAnimation: () => void;
  clear: () => void;
}

export const useAnimationQueue = create<AnimationQueueState>((set, get) => ({
  activeAnimation: null,
  queue: [],
  
  pushAnimation: (anim) => set((state) => {
    // If no active animation, start immediately
    if (!state.activeAnimation) {
      return { activeAnimation: anim };
    }
    // Otherwise queue it
    return { queue: [...state.queue, anim] };
  }),
  
  completeCurrentAnimation: () => set((state) => {
    // Execute the state update for the finishing animation
    if (state.activeAnimation) {
      // The component calling this should have already applied the state, 
      // but if we want centralized execution we do it here.
      // For now, we assume the component calls setGameState before calling complete.
    }

    const nextQueue = [...state.queue];
    const nextAnim = nextQueue.shift() || null;
    
    return {
      activeAnimation: nextAnim,
      queue: nextQueue,
    };
  }),

  clear: () => set({ activeAnimation: null, queue: [] })
}));

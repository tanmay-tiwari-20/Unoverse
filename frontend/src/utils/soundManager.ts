/**
 * Sound Manager for UNO Real.
 * Uses the Web Audio API to fetch, decode, and play high-quality audio files.
 * Designed for a premium, immersive tabletop experience.
 */
import { useSettingsStore } from '../store/useSettingsStore';

export type SoundEvent = 
  | 'card_play'
  | 'card_place'
  | 'card_draw'
  | 'shuffle'
  | 'uno'
  | 'uno_call'
  | 'victory'
  | 'win'
  | 'join'
  | 'player_join'
  | 'leave'
  | 'player_leave'
  | 'reaction'
  | 'turn_start'
  | 'hover';

class SoundManager {
  private enabled: boolean = true;
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private loadQueue: Set<string> = new Set();

  // Mapping events to actual sound file paths in /public/sounds/
  private readonly EVENT_MAP: Record<SoundEvent, string> = {
    card_play: '/sounds/card_place.mp3',
    card_place: '/sounds/card_place.mp3',
    card_draw: '/sounds/card_draw.mp3',
    shuffle: '/sounds/shuffle.mp3',
    uno: '/sounds/uno_call.mp3',
    uno_call: '/sounds/uno_call.mp3',
    victory: '/sounds/victory.mp3',
    win: '/sounds/victory.mp3',
    join: '/sounds/player_join.mp3',
    player_join: '/sounds/player_join.mp3',
    leave: '/sounds/player_leave.mp3',
    player_leave: '/sounds/player_leave.mp3',
    reaction: '/sounds/reaction.mp3',
    turn_start: '/sounds/turn_start.mp3',
    hover: '/sounds/hover.mp3'
  };

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
  }

  /**
   * Preloads an audio file into the buffer cache.
   */
  private async loadSound(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) this.initCtx();
    if (!this.ctx) return null;

    if (this.buffers.has(url)) return this.buffers.get(url)!;
    if (this.loadQueue.has(url)) return null; // Already loading

    this.loadQueue.add(url);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(url, audioBuffer);
      return audioBuffer;
    } catch (e) {
      // Silently fail if sounds aren't added to /public yet
      console.warn(`[SoundManager] Missing audio file: ${url}`);
      return null;
    } finally {
      this.loadQueue.delete(url);
    }
  }

  /**
   * Plays the audio associated with the gameplay event.
   */
  public play(event: SoundEvent, volumeScale: number = 1.0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Resume context if suspended (browser security autoplay policies)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const url = this.EVENT_MAP[event];
    if (!url) return;

    const buffer = this.buffers.get(url);
    
    // If not loaded yet, try loading it and play when ready
    if (!buffer) {
      this.loadSound(url).then(loadedBuffer => {
        if (loadedBuffer) {
          this.playSoundBuffer(loadedBuffer, volumeScale);
        }
      });
      return;
    }

    this.playSoundBuffer(buffer, volumeScale);
  }

  private playSoundBuffer(buffer: AudioBuffer, volumeScale: number) {
    if (!this.ctx) return;
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = this.ctx.createGain();
    
    // Default volumes for specific sounds to prevent them from being too loud
    let baseVolume = 0.5;
    const { gameVolume, masterVolume } = useSettingsStore.getState();
    const gVol = gameVolume / 100;
    const mVol = masterVolume / 100;
    
    gainNode.gain.value = baseVolume * volumeScale * gVol * mVol;
    
    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    source.start(0);
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const soundManager = new SoundManager();
export default soundManager;

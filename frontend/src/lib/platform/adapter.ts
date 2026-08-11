/**
 * ============================================================================
 *  PlatformAdapter — the port between Unoverse and whatever is hosting it.
 * ============================================================================
 *
 * Everything platform-specific goes through this interface. The shared game
 * (engine, rules, rooms, renderer, social) never imports a platform SDK, never
 * checks which platform it is on, and never learns that CrazyGames exists — it
 * only calls these methods, which are no-ops on web.
 *
 * DESIGN RULES this port is built to:
 *
 *  1. NOTHING THROWS. Every method must swallow its own failures and return a
 *     safe default. A platform SDK breaking must never take the game down, so
 *     callers are free to call without try/catch.
 *  2. NOTHING BLOCKS. Async methods may resolve late or never usefully; no
 *     caller may gate first paint or gameplay on one.
 *  3. ONLY WHAT UNOVERSE USES. Methods the analysis ruled out (rewarded ads,
 *     banners, purchases, completion percentage, account linking) are
 *     deliberately absent rather than stubbed — an unused stub invites a future
 *     caller to wire up something the platform review said not to ship.
 */

/** Where the platform SDK thinks it is running. */
export type PlatformEnvironment = 'web' | 'local' | 'crazygames' | 'disabled';

/** A platform-authenticated player, normalised to the fields Unoverse renders. */
export interface PlatformUser {
  username: string;
  profilePictureUrl?: string | null;
}

/** Platform-owned preferences that override local settings while active. */
export interface PlatformSettings {
  /** The player has asked the platform to hide chat everywhere. */
  disableChat: boolean;
  /** The player has muted the game at the platform level. */
  muteAudio: boolean;
}

/** Room state mirrored to the platform so it can advertise and route invites. */
export interface PlatformRoomInfo {
  /** The Unoverse room code — already globally unique per deployment. */
  roomId: string;
  /** May a newcomer accepting an invite expect to actually PLAY right now? */
  isJoinable: boolean;
  /** Params the platform replays to us when someone accepts an invite. */
  inviteParams: Record<string, string>;
}

export interface PlatformAdapter {
  readonly environment: PlatformEnvironment;

  /** True once the platform is initialised and its APIs may be used. */
  readonly isReady: boolean;

  /**
   * Bring the platform up. Called once, from the provider in the root layout.
   * Resolves even on failure — check `isReady` afterwards rather than catching.
   */
  init(): Promise<void>;

  // ---- Loading lifecycle ---------------------------------------------------
  /** Heavy loading has begun. Paired with `loadingStop`. */
  loadingStart(): void;
  /**
   * The game is genuinely PLAYABLE — not merely painted. Must be called on
   * settle rather than success, so one failed asset cannot leave the platform
   * believing we are still loading forever.
   */
  loadingStop(): void;

  // ---- Gameplay lifecycle -------------------------------------------------
  /** Active gameplay started or resumed. */
  gameplayStart(): void;
  /** Active gameplay paused or ended. */
  gameplayStop(): void;

  // ---- Celebration --------------------------------------------------------
  /** A genuine high point. Unoverse fires this once per MATCH win, never per round. */
  happytime(): void;

  // ---- Identity -----------------------------------------------------------
  /** The platform's current user, or null when absent / playing as a guest. */
  getUser(): Promise<PlatformUser | null>;
  /**
   * A short-lived signed token proving who the player is, for the backend to
   * VERIFY. Never cached by us — fetched fresh whenever auth is needed.
   */
  getUserToken(): Promise<string | null>;
  /**
   * Subscribe to sign-in / sign-out. Returns an unsubscribe function; a no-op
   * unsubscribe on platforms without accounts.
   */
  onAuthChange(cb: (user: PlatformUser | null) => void): () => void;

  // ---- Platform preferences ----------------------------------------------
  /** Current platform preferences. Safe defaults (all false) when unsupported. */
  getSettings(): PlatformSettings;
  /** Subscribe to preference changes so a mid-session toggle applies live. */
  onSettingsChange(cb: (settings: PlatformSettings) => void): () => void;

  // ---- Rooms & invites ----------------------------------------------------
  /** Publish the current room so the platform can advertise and route into it. */
  updateRoom(info: PlatformRoomInfo): void;
  /** Withdraw the current room (left the table, or it is gone). */
  clearRoom(): void;
  /** An invite param present at launch, e.g. the room code we should join. */
  getInviteParam(key: string): string | null;
  /** A shareable link that routes back into this room through the platform. */
  inviteLink(params: Record<string, string>): Promise<string | null>;
  /** Someone accepted an invite mid-session and should be taken to that room. */
  onJoinRoom(cb: (params: Record<string, string>) => void): () => void;
  /** The platform wants this player placed into a joinable room immediately. */
  readonly isInstantMultiplayer: boolean;

  // ---- Storage ------------------------------------------------------------
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;

  // ---- Ads ----------------------------------------------------------------
  /** Whether an ad blocker is present. Checked once; never fatal either way. */
  hasAdblock(): Promise<boolean>;
  /**
   * Show a between-matches ad. Resolves when the ad is done OR could not be
   * shown — the caller resumes identically in both cases and never rewards.
   */
  showMidgameAd(hooks: { onStart?: () => void; onFinish?: () => void }): Promise<void>;
}

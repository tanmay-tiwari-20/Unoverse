export interface Player {
  id: string; // Socket ID
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
  secret?: string; // Private per-session token — only present on your own player.
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing';
}

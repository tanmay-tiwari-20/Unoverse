export interface Player {
  id: string; // Socket ID
  name: string;
  seatNumber: number; // 1 to 6
  isHost: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  status: 'lobby' | 'playing';
}

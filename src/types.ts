export interface Player {
  id: string;
  name: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  isOnline: boolean;
  lastActive: number;
}

export interface Game {
  id: string;
  white: string; // Player ID
  black: string; // Player ID
  whiteName: string;
  blackName: string;
  fen: string;
  status: 'ongoing' | 'completed';
  winner: string | null; // Player ID or 'draw'
  startTime: number;
  whiteTime: number; // seconds
  blackTime: number; // seconds
  lastMoveTime: number;
}

export interface TournamentState {
  status: 'waiting' | 'active' | 'ended';
  startTime: number | null;
  endTime: number | null;
  config: TournamentConfig;
  inviteCode: string | null;
}

export interface TournamentConfig {
  duration: number; // minutes
  matchTime: number; // seconds
  maxPlayers: number;
}

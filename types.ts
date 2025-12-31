
export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  NONE = 'NONE'
}

export enum GameStatus {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
  POWERED_UP = 'POWERED_UP'
}

export interface Position {
  x: number;
  y: number;
}

export interface Ghost {
  id: string;
  pos: Position;
  dir: Direction;
  color: string;
  isVulnerable: boolean;
  spawnPos: Position;
}

export interface GameState {
  score: number;
  lives: number;
  status: GameStatus;
  pacman: Position;
  pacmanDir: Direction;
  nextDir: Direction;
  ghosts: Ghost[];
  pelletsLeft: number;
  powerTimer: number;
}

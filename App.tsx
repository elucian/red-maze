
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Direction, GameStatus, Position, Ghost, GameState } from './types';
import { INITIAL_MAZE, MAZE_COLS, MAZE_ROWS, DIRECTIONS, GHOST_COLORS } from './constants';
import { audioService } from './services/audioService';
import { Joystick } from './components/Joystick';

const PACMAN_SPEED = 0.14; 
const GHOST_SPEED_BASE = PACMAN_SPEED * 0.9;
const MAX_MOUTH_ANGLE = 0.125; 

enum GhostMode {
  CHASE = 'CHASE',
  SCATTER = 'SCATTER',
  EXITING_HOUSE = 'EXITING_HOUSE',
  WAITING_IN_HOUSE = 'WAITING_IN_HOUSE'
}

interface ExtendedGhost extends Ghost {
  mode: GhostMode;
  respawnTimer: number;
  collisionTimer: number; 
  exitOrder: number;
  patrolTarget: Position | null;
}

interface Magnet {
  pos: Position;
}

interface FullGameState extends GameState {
  level: number;
  magnet: null | Magnet;
  ghosts: ExtendedGhost[];
  maze: number[][];
  gameStartTime: number;
  modeTimer: number;
  levelFrameCount: number;
  currentMode: GhostMode;
  hasPlayerStarted: boolean;
  isSimulating: boolean;
  isExited: boolean;
}

const SCATTER_TARGETS: Record<string, Position> = {
  blinky: { x: 17, y: 1 },
  pinky: { x: 1, y: 1 },
  inky: { x: 17, y: 19 },
  clyde: { x: 1, y: 19 }
};

const PATROL_WAYPOINTS: Position[] = [
  { x: 1, y: 1 }, { x: 17, y: 1 }, { x: 1, y: 19 }, { x: 17, y: 19 },
  { x: 9, y: 1 }, { x: 9, y: 19 }, { x: 1, y: 5 }, { x: 17, y: 5 },
  { x: 1, y: 14 }, { x: 17, y: 14 }, { x: 5, y: 9 }, { x: 13, y: 9 }
];

const App: React.FC = () => {
  const [gameState, setGameState] = useState<FullGameState>({
    score: 0,
    lives: 3,
    status: GameStatus.IDLE,
    pacman: { x: 9, y: 15 },
    pacmanDir: Direction.NONE,
    nextDir: Direction.NONE,
    ghosts: [],
    pelletsLeft: 0,
    powerTimer: 0,
    level: 1,
    magnet: null,
    maze: INITIAL_MAZE.map(row => [...row]),
    gameStartTime: 0,
    modeTimer: 0,
    levelFrameCount: 0,
    currentMode: GhostMode.SCATTER,
    hasPlayerStarted: false,
    isSimulating: false,
    isExited: false
  });

  const [dimensions, setDimensions] = useState({ width: 0, height: 0, cellW: 30, cellH: 30, offsetX: 0, offsetY: 0 });
  const [layoutMode, setLayoutMode] = useState<'DESKTOP' | 'MOBILE_LANDSCAPE' | 'PORTRAIT'>('DESKTOP');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const updateRef = useRef<() => void>(() => {});

  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    const isLargeDevice = winW >= 1024;
    let mode: 'DESKTOP' | 'MOBILE_LANDSCAPE' | 'PORTRAIT' = 'DESKTOP';
    
    if (isLargeDevice) {
      mode = 'DESKTOP';
    } else if (winW > winH) {
      mode = 'MOBILE_LANDSCAPE';
    } else {
      mode = 'PORTRAIT';
    }
    
    setLayoutMode(mode);

    let leftPanelW = 0, rightPanelW = 0, topHudH = 0, bottomControlsH = 0;
    
    if (mode === 'DESKTOP') {
      leftPanelW = 260; 
      rightPanelW = 0;
    } else if (mode === 'MOBILE_LANDSCAPE') {
      leftPanelW = 180; 
      rightPanelW = 180;
    } else {
      topHudH = 70; 
      bottomControlsH = 150; 
    }

    const availableAreaW = winW - leftPanelW - rightPanelW;
    const availableAreaH = winH - topHudH - bottomControlsH;

    let scale = 1;
    const padding = 6;
    if (mode === 'PORTRAIT') {
      scale = (availableAreaW - padding) / MAZE_COLS;
      if (scale * MAZE_ROWS > availableAreaH - padding) {
        scale = (availableAreaH - padding) / MAZE_ROWS;
      }
    } else {
      scale = (availableAreaH - padding) / MAZE_ROWS;
      if (scale * MAZE_COLS > availableAreaW - padding) {
        scale = (availableAreaW - padding) / MAZE_COLS;
      }
    }

    const cellW = scale;
    const cellH = scale;
    const mazeW = cellW * MAZE_COLS;
    const mazeH = cellH * MAZE_ROWS;

    const offsetX = (availableAreaW - mazeW) / 2;
    const offsetY = (availableAreaH - mazeH) / 2;

    setDimensions({ 
      width: availableAreaW, height: availableAreaH, cellW, cellH, 
      offsetX, offsetY
    });
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [updateDimensions]);

  useEffect(() => {
    updateDimensions();
  }, [gameState.status, updateDimensions]);

  const abortGame = useCallback(() => {
    setGameState(prev => ({ ...prev, status: GameStatus.IDLE, magnet: null, hasPlayerStarted: false }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abortGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abortGame]);

  const isWall = (x: number, y: number, isGhost = false, mode: GhostMode = GhostMode.SCATTER) => {
    const col = ((Math.round(x) % MAZE_COLS) + MAZE_COLS) % MAZE_COLS;
    const row = ((Math.round(y) % MAZE_ROWS) + MAZE_ROWS) % MAZE_ROWS;
    if (row < 0 || row >= MAZE_ROWS) return true;
    const cell = INITIAL_MAZE[row][col];
    if (cell === 0) return true;
    if (cell === 4) { 
      if (isGhost && (mode === GhostMode.EXITING_HOUSE || mode === GhostMode.WAITING_IN_HOUSE)) return false;
      return true;
    }
    return false;
  };

  const getRandomPatrolTarget = (exclude?: Position | null) => {
    let filtered = PATROL_WAYPOINTS;
    if (exclude) {
      filtered = PATROL_WAYPOINTS.filter(wp => wp.x !== exclude.x || wp.y !== exclude.y);
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
  };

  const initLevel = (level: number, currentScore: number, currentLives: number, simulate: boolean = false) => {
    let pellets = 0;
    const newMaze = INITIAL_MAZE.map(row => row.map(cell => { if (cell === 1 || cell === 2) pellets++; return cell; }));
    const allPossibleGhosts: ExtendedGhost[] = [
      { id: 'blinky', pos: { x: 9, y: 8 }, dir: Direction.UP, color: GHOST_COLORS.BLINKY, isVulnerable: false, spawnPos: { x: 9, y: 8 }, mode: GhostMode.WAITING_IN_HOUSE, respawnTimer: 0, collisionTimer: 0, exitOrder: 0, patrolTarget: null },
      { id: 'pinky', pos: { x: 9, y: 9 }, dir: Direction.UP, color: GHOST_COLORS.PINKY, isVulnerable: false, spawnPos: { x: 9, y: 9 }, mode: GhostMode.WAITING_IN_HOUSE, respawnTimer: 0, collisionTimer: 0, exitOrder: 1, patrolTarget: null },
      { id: 'inky', pos: { x: 8, y: 9 }, dir: Direction.UP, color: GHOST_COLORS.INKY, isVulnerable: false, spawnPos: { x: 8, y: 9 }, mode: GhostMode.WAITING_IN_HOUSE, respawnTimer: 0, collisionTimer: 0, exitOrder: 2, patrolTarget: null },
      { id: 'clyde', pos: { x: 10, y: 9 }, dir: Direction.UP, color: GHOST_COLORS.CLYDE, isVulnerable: false, spawnPos: { x: 10, y: 9 }, mode: GhostMode.WAITING_IN_HOUSE, respawnTimer: 0, collisionTimer: 0, exitOrder: 3, patrolTarget: null },
    ];
    setGameState({ score: currentScore, lives: currentLives, status: GameStatus.IDLE, level: level, pelletsLeft: pellets, powerTimer: 0, pacman: { x: 9, y: 15 }, pacmanDir: Direction.NONE, nextDir: Direction.NONE, magnet: null, maze: newMaze, gameStartTime: 0, modeTimer: 0, levelFrameCount: 0, currentMode: GhostMode.SCATTER, ghosts: allPossibleGhosts, hasPlayerStarted: false, isSimulating: simulate, isExited: false });
  };

  const startGame = (sim: boolean = false, startLevel: number = 1, currentScore: number = 0, currentLives: number = 3) => {
    audioService.init(); 
    audioService.playStart();
    initLevel(startLevel, currentScore, currentLives, sim);
    setGameState(prev => ({ ...prev, status: GameStatus.PLAYING, gameStartTime: Date.now() }));
  };

  const getSmartNextDir = (startX: number, startY: number, targetX: number, targetY: number, currentDir: Direction = Direction.NONE, allowReverse: boolean = false, isGhost: boolean = false, mode: GhostMode = GhostMode.SCATTER): Direction => {
    const sx = Math.round(startX); const sy = Math.round(startY); const tx = Math.round(targetX); const ty = Math.round(targetY);
    if (sx === tx && sy === ty) return Direction.NONE;
    const oppDirs: Record<Direction, Direction> = { [Direction.UP]: Direction.DOWN, [Direction.DOWN]: Direction.UP, [Direction.LEFT]: Direction.RIGHT, [Direction.RIGHT]: Direction.LEFT, [Direction.NONE]: Direction.NONE };
    const queue: { x: number; y: number; firstMove: Direction }[] = []; const visited = new Set<string>(); const possibleDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT] as Direction[];
    for (const d of possibleDirs) { if (!allowReverse && d === oppDirs[currentDir]) continue; const m = DIRECTIONS[d]; const nx = (sx + m.dx + MAZE_COLS) % MAZE_COLS; const ny = (sy + m.dy + MAZE_ROWS) % MAZE_ROWS; if (!isWall(nx, ny, isGhost, mode)) { queue.push({ x: nx, y: ny, firstMove: d }); visited.add(`${nx},${ny}`); } }
    while (queue.length > 0) { const curr = queue.shift()!; if (curr.x === tx && curr.y === ty) return curr.firstMove; for (const d of possibleDirs) { const m = DIRECTIONS[d]; const nx = (curr.x + m.dx + MAZE_COLS) % MAZE_COLS; const ny = (curr.y + m.dy + MAZE_ROWS) % MAZE_ROWS; if (!isWall(nx, ny, isGhost, mode) && !visited.has(`${nx},${ny}`)) { visited.add(`${nx},${ny}`); queue.push({ x: nx, y: ny, firstMove: curr.firstMove }); } } }
    return Direction.NONE;
  };

  const getDirToNearestPellet = (startX: number, startY: number, maze: number[][]): Direction => {
    const sx = Math.round(startX); const sy = Math.round(startY); const queue: { x: number; y: number; firstMove: Direction }[] = []; const visited = new Set<string>(); const possibleDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT] as Direction[];
    for (const d of possibleDirs) { const m = DIRECTIONS[d]; const nx = (sx + m.dx + MAZE_COLS) % MAZE_COLS; const ny = (sy + m.dy + MAZE_ROWS) % MAZE_ROWS; if (!isWall(nx, ny)) { queue.push({ x: nx, y: ny, firstMove: d }); visited.add(`${nx},${ny}`); } }
    while (queue.length > 0) { const curr = queue.shift()!; const cell = maze[curr.y][curr.x]; if (cell === 1 || cell === 2) return curr.firstMove; for (const d of possibleDirs) { const m = DIRECTIONS[d]; const nx = (curr.x + m.dx + MAZE_COLS) % MAZE_COLS; const ny = (curr.y + m.dy + MAZE_ROWS) % MAZE_ROWS; if (!isWall(nx, ny) && !visited.has(`${nx},${ny}`)) { visited.add(`${nx},${ny}`); queue.push({ x: nx, y: ny, firstMove: curr.firstMove }); } } }
    return Direction.NONE;
  };

  const updateGame = useCallback(() => {
    setGameState(prev => {
      if (prev.status !== GameStatus.PLAYING && prev.status !== GameStatus.POWERED_UP) return prev;
      if (!prev.hasPlayerStarted && !prev.isSimulating) return prev;
      let { pacman, pacmanDir, nextDir, magnet, score, pelletsLeft, status, powerTimer, lives, maze, modeTimer, levelFrameCount, currentMode, isSimulating, level, gameStartTime, hasPlayerStarted } = prev;
      let ghosts = prev.ghosts.map(g => ({ ...g }));
      levelFrameCount++; modeTimer++;
      const playtimeSeconds = (Date.now() - gameStartTime) / 1000;
      const releaseThreshold = (5 - level) * 10;
      const huntThreshold = (6 - level) * 60;
      const isHunting = playtimeSeconds >= huntThreshold;
      if (!isHunting) {
        const scatterDuration = 420; const chaseDuration = 1200;  
        if (currentMode === GhostMode.SCATTER && modeTimer > scatterDuration) { currentMode = GhostMode.CHASE; modeTimer = 0; }
        else if (currentMode === GhostMode.CHASE && modeTimer > chaseDuration) { currentMode = GhostMode.SCATTER; modeTimer = 0; }
      } else { currentMode = GhostMode.CHASE; }
      const oppDirs: Record<Direction, Direction> = { [Direction.UP]: Direction.DOWN, [Direction.DOWN]: Direction.UP, [Direction.LEFT]: Direction.RIGHT, [Direction.RIGHT]: Direction.LEFT, [Direction.NONE]: Direction.NONE };
      const pSpeed = PACMAN_SPEED; const gridX = Math.round(pacman.x); const gridY = Math.round(pacman.y); const distToCenter = Math.hypot(pacman.x - gridX, pacman.y - gridY);
      if (distToCenter < pSpeed * 0.95) {
        const gx = ((gridX % MAZE_COLS) + MAZE_COLS) % MAZE_COLS; const gy = ((gridY % MAZE_ROWS) + MAZE_ROWS) % MAZE_ROWS;
        if (maze[gy][gx] === 1 || maze[gy][gx] === 2) {
          score += (maze[gy][gx] === 2 ? 50 : 10); pelletsLeft--;
          if (maze[gy][gx] === 2) { status = GameStatus.POWERED_UP; powerTimer = 600; audioService.playPower(); ghosts = ghosts.map(g => ({ ...g, isVulnerable: true, dir: oppDirs[g.dir] || Direction.UP })); }
          else { audioService.playWaka(); }
          maze[gy][gx] = 3;
        }
        if (magnet) {
          if (gx === magnet.pos.x && gy === magnet.pos.y) { magnet = null; pacmanDir = Direction.NONE; pacman.x = gridX; pacman.y = gridY; }
          else { const aiDir = getSmartNextDir(gx, gy, magnet.pos.x, magnet.pos.y); if (aiDir !== Direction.NONE) { pacmanDir = aiDir; pacman.x = gridX; pacman.y = gridY; } }
        } else if (isSimulating) { const aiDir = getDirToNearestPellet(gx, gy, maze); if (aiDir !== Direction.NONE) { pacmanDir = aiDir; pacman.x = gridX; pacman.y = gridY; } }
        if (nextDir !== Direction.NONE) {
          const m = DIRECTIONS[nextDir]; if (!isWall(gx + m.dx, gy + m.dy)) { pacmanDir = nextDir; nextDir = Direction.NONE; pacman.x = gridX; pacman.y = gridY; magnet = null; }
        }
        if (pacmanDir !== Direction.NONE && !magnet && (!isSimulating || hasPlayerStarted)) {
          const m = DIRECTIONS[pacmanDir]; if (isWall(gx + m.dx, gy + m.dy)) { pacmanDir = Direction.NONE; pacman.x = gridX; pacman.y = gridY; }
        }
      }
      if (pacmanDir !== Direction.NONE) { const m = DIRECTIONS[pacmanDir]; pacman.x = (pacman.x + m.dx * pSpeed + MAZE_COLS) % MAZE_COLS; pacman.y = (pacman.y + m.dy * pSpeed + MAZE_ROWS) % MAZE_ROWS; }
      if (powerTimer > 0) { powerTimer--; if (powerTimer === 0) { status = GameStatus.PLAYING; ghosts = ghosts.map(g => ({ ...g, isVulnerable: false })); } }
      ghosts = ghosts.map(g => { if (g.mode === GhostMode.WAITING_IN_HOUSE && playtimeSeconds >= releaseThreshold + (g.exitOrder * 2)) { return { ...g, mode: GhostMode.EXITING_HOUSE }; } return g; });
      let lifeLost = false;
      const nextGhosts = ghosts.map(ghost => {
        if (ghost.respawnTimer > 0) { const newTimer = ghost.respawnTimer - 1; if (newTimer === 0) return { ...ghost, respawnTimer: 0, pos: { ...ghost.spawnPos }, mode: GhostMode.WAITING_IN_HOUSE, isVulnerable: false }; return { ...ghost, respawnTimer: newTimer }; }
        if (ghost.collisionTimer > 0) { ghost.collisionTimer--; if (ghost.collisionTimer === 0) { ghost.dir = oppDirs[ghost.dir] || Direction.UP; } return ghost; }
        const distToP = Math.hypot(ghost.pos.x - pacman.x, ghost.pos.y - pacman.y);
        if (distToP < 0.65) { if (ghost.isVulnerable) { audioService.playEatGhost(); score += 200; return { ...ghost, respawnTimer: 600, pos: { ...ghost.spawnPos }, isVulnerable: false, mode: GhostMode.WAITING_IN_HOUSE }; } else { lifeLost = true; } }
        let { x, y } = ghost.pos; let { dir, mode } = ghost; const gcx = Math.round(x); const gcy = Math.round(y); const gDist = Math.hypot(x - gcx, y - gcy);
        if (gDist < GHOST_SPEED_BASE * 0.4) {
          const gx = ((gcx % MAZE_COLS) + MAZE_COLS) % MAZE_COLS; const gy = ((gcy % MAZE_ROWS) + MAZE_ROWS) % MAZE_ROWS;
          if (mode === GhostMode.EXITING_HOUSE) { if (y <= 7.05) { mode = GhostMode.SCATTER; dir = Math.random() > 0.5 ? Direction.LEFT : Direction.RIGHT; x = 9; y = 7; } else if (Math.abs(x - 9) < 0.1) { dir = Direction.UP; x = 9; } else { dir = x < 9 ? Direction.RIGHT : Direction.LEFT; } }
          else if (mode !== GhostMode.WAITING_IN_HOUSE) {
            let target: Position = pacman;
            if (ghost.isVulnerable) { 
              const av: Direction[] = []; for (const d of [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT] as Direction[]) { const m = DIRECTIONS[d]; if (!isWall(gx + m.dx, gy + m.dy, true, mode) && d !== oppDirs[dir]) av.push(d); }
              dir = av.length > 0 ? av[Math.floor(Math.random() * av.length)] : (oppDirs[dir] || Direction.UP);
            } else {
              if (isHunting) { target = pacman; } else if (currentMode === GhostMode.SCATTER) { target = SCATTER_TARGETS[ghost.id] || pacman; }
              else { if (!ghost.patrolTarget || Math.hypot(ghost.pos.x - ghost.patrolTarget.x, ghost.pos.y - ghost.patrolTarget.y) < 0.8) { if (Math.random() < 0.75) { ghost.patrolTarget = getRandomPatrolTarget(ghost.patrolTarget); } else { ghost.patrolTarget = { x: Math.round(pacman.x), y: Math.round(pacman.y) }; } } target = ghost.patrolTarget; }
              const nextAiDir = getSmartNextDir(gx, gy, target.x, target.y, dir, false, true, mode); if (nextAiDir !== Direction.NONE) { dir = nextAiDir; }
              else { const av: Direction[] = []; for (const d of [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT] as Direction[]) { const m = DIRECTIONS[d]; if (!isWall(gx + m.dx, gy + m.dy, true, mode) && d !== oppDirs[dir]) av.push(d); } dir = av.length > 0 ? av[Math.floor(Math.random() * av.length)] : (oppDirs[dir] || Direction.UP); }
            }
            x = gcx; y = gcy; 
          }
        }
        if (mode !== GhostMode.WAITING_IN_HOUSE) { const s = ghost.isVulnerable ? GHOST_SPEED_BASE * 0.6 : GHOST_SPEED_BASE; const gm = DIRECTIONS[dir] || { dx: 0, dy: 0 }; x = (x + gm.dx * s + MAZE_COLS) % MAZE_COLS; y = (y + gm.dy * s + MAZE_ROWS) % MAZE_ROWS; }
        return { ...ghost, pos: { x, y }, dir, mode };
      });
      if (lifeLost) { audioService.playDeath(); lives--; if (lives <= 0) { status = GameStatus.LOST; } else { return { ...prev, pacman: { x: 9, y: 15 }, pacmanDir: Direction.NONE, lives, magnet: null, ghosts: prev.ghosts.map(g => ({ ...g, pos: { ...g.spawnPos }, mode: GhostMode.WAITING_IN_HOUSE, isVulnerable: false, respawnTimer: 0, collisionTimer: 0, patrolTarget: null })), hasPlayerStarted: false, levelFrameCount: 0 }; } }
      if (pelletsLeft === 0) { status = GameStatus.WON; }
      return { ...prev, pacman, pacmanDir, nextDir, magnet, score, pelletsLeft, status, powerTimer, ghosts: nextGhosts, lives, maze, modeTimer, levelFrameCount, currentMode };
    });
  }, []);

  useEffect(() => { updateRef.current = updateGame; }, [updateGame]);
  useEffect(() => { const loop = () => { updateRef.current(); frameRef.current = requestAnimationFrame(loop); }; frameRef.current = requestAnimationFrame(loop); return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }; }, []);

  const drawWall = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const bh = h / 2; const drawBrick = (bx: number, by: number, width: number, height: number) => { ctx.fillStyle = '#8a1a1a'; ctx.fillRect(bx, by, width, height); const s = Math.max(1, height * 0.15); ctx.fillStyle = '#c53030'; ctx.fillRect(bx, by, width, s); ctx.fillRect(bx, by, s, height); ctx.fillStyle = '#4a0a0a'; ctx.fillRect(bx, by + height - s, width, s); ctx.fillRect(bx + width - s, by, s, height); };
    drawBrick(x, y, w, bh); drawBrick(x, y + bh, w, bh);
  };

  const drawPacman = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dir: Direction) => {
    const cx = x + w/2; const cy = y + h/2; const r = (Math.min(w, h)/2) * 0.88; 
    const rot = { [Direction.RIGHT]: 0, [Direction.LEFT]: Math.PI, [Direction.UP]: -Math.PI/2, [Direction.DOWN]: Math.PI/2, [Direction.NONE]: 0 };
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot[dir]);
    ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.moveTo(0, 0);
    const m = (dir === Direction.NONE) ? MAX_MOUTH_ANGLE * Math.PI : Math.abs(Math.sin(Date.now() / 80)) * MAX_MOUTH_ANGLE * Math.PI;
    ctx.arc(0, 0, r, m, 2 * Math.PI - m); ctx.fill();
    ctx.fillStyle = '#000'; 
    const eyeRadius = r * 0.16; const eyeX = r * 0.35; let eyeY = -r * 0.45; 
    if (dir === Direction.LEFT) eyeY = r * 0.45;
    ctx.beginPath(); ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  const drawGhost = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, vuln: boolean, dir: Direction, isStunned: boolean) => {
    const cx = x + w/2; const cy = y + h/2; const r = (Math.min(w, h)/2) * 0.9;
    ctx.save(); if (isStunned) ctx.globalAlpha = 0.6; ctx.fillStyle = vuln ? '#2563eb' : color;
    ctx.beginPath(); ctx.arc(cx, cy - r*0.1, r, Math.PI, 0); ctx.lineTo(cx + r, cy + r); 
    for (let i = 0; i <= 3; i++) ctx.lineTo((cx + r) - (i * (r*2/3)), cy + r + (Math.sin(Date.now()/90 + i)*2));
    ctx.lineTo(cx - r, cy + r); ctx.fill();
    ctx.fillStyle = '#fff'; const es = r * 0.35; const eo = r * 0.4;
    ctx.beginPath(); ctx.arc(cx - eo, cy - r * 0.2, es, 0, Math.PI * 2); ctx.arc(cx + eo, cy - r * 0.2, es, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; const m = DIRECTIONS[dir] || { dx: 0, dy: 0 };
    ctx.beginPath(); ctx.arc(cx - eo + m.dx * 2, cy - r * 0.2 + m.dy * 2, es * 0.6, 0, Math.PI * 2); ctx.arc(cx + eo + m.dx * 2, cy - r * 0.2 + m.dy * 2, es * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const { cellW, cellH, width, height, offsetX, offsetY } = dimensions;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#080504'; ctx.fillRect(0, 0, width, height);
    if (gameState.status !== GameStatus.IDLE && !gameState.isExited) {
      ctx.save(); ctx.translate(offsetX, offsetY);
      gameState.maze.forEach((row, y) => { row.forEach((cell, x) => { if (cell === 0) drawWall(ctx, x * cellW, y * cellH, cellW, cellH); else if (cell === 1) { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(x * cellW + cellW/2, y * cellH + cellH/2, 3, 0, Math.PI * 2); ctx.fill(); } else if (cell === 2) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x * cellW + cellW/2, y * cellH + cellH/2, 7, 0, Math.PI * 2); ctx.fill(); } }); });
      if (gameState.magnet) { ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(gameState.magnet.pos.x * cellW + cellW/2, gameState.magnet.pos.y * cellH + cellH/2, cellW * 0.8, 0, Math.PI * 2); ctx.stroke(); }
      drawPacman(ctx, gameState.pacman.x * cellW, gameState.pacman.y * cellH, cellW, cellH, gameState.pacmanDir);
      gameState.ghosts.forEach(g => { if (g.respawnTimer === 0) drawGhost(ctx, g.pos.x * cellW, g.pos.y * cellH, cellW, cellH, g.color, g.isVulnerable, g.dir, g.collisionTimer > 0); });
      ctx.restore();
    }
  }, [gameState, dimensions]);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState.status !== GameStatus.PLAYING && gameState.status !== GameStatus.POWERED_UP) return;
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const gx = Math.floor((x - dimensions.offsetX) / dimensions.cellW); 
    const gy = Math.floor((y - dimensions.offsetY) / dimensions.cellH);
    if (gx >= 0 && gx < MAZE_COLS && gy >= 0 && gy < MAZE_ROWS && !isWall(gx, gy)) { setGameState(prev => ({ ...prev, magnet: { pos: { x: gx, y: gy } }, hasPlayerStarted: true })); }
  };

  const HudColumn = ({ compact }: { compact?: boolean }) => (
    <div className={`flex flex-col items-center w-full ${compact ? 'gap-2' : 'gap-6'}`}>
      <div className="flex flex-col items-center">
        <span className="text-[7px] md:text-[8px] text-white/40 font-black tracking-widest uppercase mb-1">HARVEST</span>
        <span className="text-red-600 font-black text-xl md:text-4xl font-mono tabular-nums leading-none">
          {gameState.score.toString().padStart(6, '0')}
        </span>
      </div>
      <div className={`bg-red-950/40 border border-red-500/30 flex items-center justify-center w-full max-w-[240px] ${compact ? 'py-1' : 'py-2'}`}>
        <span className="text-white font-black text-[9px] md:text-[10px] tracking-[0.2em] uppercase">FLOOR {gameState.level}</span>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`w-3 h-3 md:w-4 md:h-4 rounded-full border ${i < gameState.lives ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_6px_yellow]' : 'bg-white/5 border-white/10'}`}></div>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#080504] overflow-hidden flex touch-none select-none">
      
      {/* LANDSCAPE SIDEBAR (Desktop or Mobile) */}
      {(layoutMode === 'DESKTOP' || layoutMode === 'MOBILE_LANDSCAPE') && (
        <aside className={`${layoutMode === 'DESKTOP' ? 'w-[260px] md:w-[300px]' : 'w-[180px]'} bg-black border-r border-white/10 p-4 md:p-6 flex flex-col items-center z-20 shadow-[20px_0_30px_rgba(0,0,0,0.5)] ${layoutMode === 'DESKTOP' ? 'justify-start gap-10' : 'justify-between'}`}>
          <h2 className={`text-red-600 font-black italic tracking-tighter drop-shadow-[0_0_15px_red] text-center uppercase ${layoutMode === 'DESKTOP' ? 'text-xl md:text-3xl' : 'text-[13px] md:text-sm'}`}>RED MAZE</h2>
          <HudColumn compact={layoutMode === 'MOBILE_LANDSCAPE'} />
          
          <div className="mt-auto w-full flex flex-col items-center">
            <button 
              onClick={abortGame}
              className="w-full py-2.5 md:py-3 bg-red-950/40 border border-red-500/30 text-red-500 font-black text-[10px] md:text-xs tracking-[0.3em] hover:bg-red-600 hover:text-white transition-all active:scale-95 uppercase mb-4"
            >
              ABORT
            </button>
            <div className="opacity-20 text-[6px] text-white font-mono uppercase tracking-[0.3em] text-center">Neural Link Active</div>
          </div>
        </aside>
      )}

      {/* MAIN GAME AREA */}
      <main className="flex-1 relative flex flex-col bg-[#080504]">
        {/* PORTRAIT HEADER */}
        {layoutMode === 'PORTRAIT' && (
          <header className="h-[70px] w-full flex flex-col items-center justify-center bg-black border-b border-white/10 z-20 gap-1 p-2">
             <h2 className="text-red-600 font-black text-xs italic tracking-tighter drop-shadow-[0_0_8px_red] uppercase">RED MAZE</h2>
             <div className="flex items-center justify-center gap-3">
               <div className="flex flex-col items-center">
                  <span className="text-[6px] text-white/40 font-black uppercase tracking-[0.1em]">HARVEST</span>
                  <span className="text-red-600 font-black text-sm font-mono">{gameState.score.toString().padStart(6, '0')}</span>
               </div>
               <div className="h-4 w-[1px] bg-white/20"></div>
               <div className="flex flex-col items-center">
                  <span className="text-[6px] text-white/40 font-black uppercase tracking-[0.1em]">FLOOR</span>
                  <span className="text-white font-black text-[11px]">{gameState.level}</span>
               </div>
               <div className="h-4 w-[1px] bg-white/20"></div>
               <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full border ${i < gameState.lives ? 'bg-yellow-400 border-yellow-200 shadow-[0_0_4px_yellow]' : 'bg-white/5 border-white/10'}`}></div>
                ))}
              </div>
             </div>
          </header>
        )}

        <canvas 
          ref={canvasRef} 
          width={dimensions.width} 
          height={dimensions.height} 
          onPointerDown={handlePointer} 
          className="flex-1 block cursor-crosshair" 
        />

        {/* PORTRAIT BOTTOM CONTROLS */}
        {layoutMode === 'PORTRAIT' && (
          <div className="h-[150px] bg-black border-t border-white/5 flex items-center justify-center pointer-events-auto z-20">
            <Joystick 
              onDirectionChange={(d) => setGameState(prev => ({ ...prev, nextDir: d, magnet: null, hasPlayerStarted: true }))} 
              onAbort={abortGame}
            />
          </div>
        )}
      </main>

      {/* MOBILE LANDSCAPE RIGHT PANEL */}
      {layoutMode === 'MOBILE_LANDSCAPE' && (
        <aside className="w-[180px] bg-black border-l border-white/10 p-3 flex flex-col items-center justify-center z-20 shadow-[-20px_0_30px_rgba(0,0,0,0.5)]">
          <Joystick 
            onDirectionChange={(d) => setGameState(prev => ({ ...prev, nextDir: d, magnet: null, hasPlayerStarted: true }))} 
            onAbort={abortGame}
          />
        </aside>
      )}

      {/* OVERLAYS */}
      {gameState.status === GameStatus.IDLE && !gameState.isExited && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-black border-4 border-red-700 p-6 md:p-8 max-w-sm md:max-w-md w-full shadow-[0_0_60px_rgba(220,38,38,0.4)] flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <h1 className="text-2xl md:text-4xl font-black text-red-600 mb-6 tracking-tighter italic drop-shadow-[0_0_12px_red] text-center uppercase">RED MAZE</h1>
            <button onClick={() => startGame(false)} className="w-full py-4 bg-red-700 hover:bg-red-600 text-white font-black text-lg md:text-2xl transition-all active:scale-95 shadow-[0_0_20px_rgba(185,28,28,0.5)] uppercase tracking-[0.1em] italic mb-6">ENGAGE</button>
            <div className="grid grid-cols-2 gap-3 w-full">
              {[1, 2, 3, 4].map(l => (
                <button key={l} onClick={() => startGame(true, l)} className="py-2.5 bg-white/5 text-white/70 border border-white/10 font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-all">SIM FLOOR {l}</button>
              ))}
            </div>
            <p className="mt-6 text-white/30 text-[8px] uppercase tracking-[0.2em] italic text-center leading-relaxed font-mono">MANUAL: Override • AUTO: Neural Path • ESC: Menu</p>
          </div>
        </div>
      )}

      {gameState.isExited && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-center z-[110] backdrop-blur-md">
          <div className="max-w-xs w-full bg-black border-2 border-red-700 p-8 shadow-2xl">
            <h1 className="text-2xl md:text-3xl font-black text-red-600 mb-6 italic tracking-tighter drop-shadow-[0_0_15px_red] uppercase">TERMINATED</h1>
            <button onClick={() => setGameState(prev => ({ ...prev, isExited: false, status: GameStatus.IDLE }))} className="w-full py-3 bg-white/5 border border-white/20 text-white font-black hover:bg-white/10 uppercase tracking-widest active:scale-95 transition-all text-sm">REBOOT</button>
          </div>
        </div>
      )}

      {(gameState.status === GameStatus.LOST || gameState.status === GameStatus.WON) && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center p-4 z-[120] backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto">
          <div className="bg-black border-2 border-red-700 p-6 md:p-8 shadow-[0_0_80px_rgba(220,38,38,0.3)] max-w-sm md:max-w-md w-full my-auto">
            {gameState.status === GameStatus.LOST ? (
              <>
                <h2 className="text-2xl md:text-3xl font-black mb-4 italic text-red-700 drop-shadow-[0_0_15px_red] uppercase">TERMINATED</h2>
                <div className="bg-white/5 px-4 py-4 border border-white/10 mb-6">
                  <span className="text-white/30 text-[8px] font-black tracking-[0.2em] uppercase block mb-1">FINAL HARVEST</span>
                  <p className="text-white text-2xl md:text-4xl font-mono font-black tabular-nums leading-none">{gameState.score}</p>
                </div>
                <button onClick={() => setGameState(prev => ({ ...prev, status: GameStatus.IDLE }))} className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-black text-base md:text-lg uppercase tracking-[0.1em] transition-all active:scale-95">REBOOT SYSTEM</button>
              </>
            ) : (
              <>
                <h2 className="text-xl md:text-2xl font-black mb-4 italic text-green-500 drop-shadow-[0_0_15px_green] uppercase leading-tight">{gameState.level === 4 ? 'LINK ESTABLISHED' : 'DATA EXTRACTED'}</h2>
                <div className="bg-white/5 px-4 py-4 border border-white/10 mb-6">
                  <p className="text-white text-2xl md:text-4xl font-mono font-black tabular-nums mb-1 leading-none">{gameState.score} BITS</p>
                </div>
                <button onClick={() => gameState.level === 4 ? setGameState(prev => ({ ...prev, status: GameStatus.IDLE })) : startGame(false, gameState.level + 1, gameState.score, gameState.lives)} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-black text-base md:text-lg uppercase tracking-[0.1em] transition-all active:scale-95">
                  {gameState.level === 4 ? 'RETURN HUB' : 'NEXT SECTOR'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

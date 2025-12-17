import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '../ui/Button';
import { playSound } from '../../utils/sound';
import { User, GameType, MatchDetails } from '../../types';
import { StreakIndicator } from '../ui/StreakIndicator';

interface Props {
  user: User;
  onGameEnd: (points: number, isWin?: boolean, details?: MatchDetails) => void;
  player2?: User | null;
  onOpenP2Login?: () => void;
}

type BilliardsMode = '8BALL' | '9BALL';
type GroupType = 'SOLIDS' | 'STRIPES' | null;

// --- Physics Constants ---
const TABLE_WIDTH = 800;
const TABLE_HEIGHT = 400;
const BALL_RADIUS = 12; 
const POCKET_RADIUS = 28; 

// Physics Parameters
const SUB_STEPS = 8; 
const DECELERATION = 0.045;
const WALL_BOUNCE = 0.75;
const BALL_RESTITUTION = 0.92; 
const MAX_POWER = 45;
const STOP_THRESHOLD = 0.08;

const BALL_COLORS = [
  '#f0f0f0', '#fbbf24', '#2563eb', '#dc2626', '#7e22ce', '#f97316', '#16a34a', '#881337', 
  '#111111', '#fbbf24', '#2563eb', '#dc2626', '#7e22ce', '#f97316', '#16a34a', '#881337'
];

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean; 
  type: 'CUE' | 'SOLID' | 'STRIPE' | 'EIGHT' | 'NINE';
}

interface MatchConfig {
    totalFrames: number; 
    pointsPerMatch: number;
}

export const Billiards: React.FC<Props> = ({ user, onGameEnd, player2, onOpenP2Login }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<BilliardsMode>('8BALL');
  const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'ROUND_OVER' | 'GAMEOVER'>('SETUP');
  
  // Match State
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({ totalFrames: 3, pointsPerMatch: 100 });
  const [matchScore, setMatchScore] = useState<{p1: number, p2: number}>({ p1: 0, p2: 0 });
  
  const [turn, setTurn] = useState<1 | 2>(1);
  const [winner, setWinner] = useState<string | null>(null); 
  const [matchWinner, setMatchWinner] = useState<string | null>(null);

  const [balls, setBalls] = useState<Ball[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  
  const [playerGroups, setPlayerGroups] = useState<{1: GroupType, 2: GroupType}>({ 1: null, 2: null });
  
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{x: number, y: number} | null>(null);
  const [power, setPower] = useState(0);

  const [placingBall, setPlacingBall] = useState(false);
  const [validPlacement, setValidPlacement] = useState(true);

  const [foulMessage, setFoulMessage] = useState<string | null>(null);

  const ballsRef = useRef<Ball[]>([]);
  const requestRef = useRef<number>(0);
  const soundCooldowns = useRef<Record<string, number>>({}); 

  const turnInfoRef = useRef<{
      pottedThisTurn: boolean;
      firstHitId: number | null;
      nineBallPotted: boolean;
  }>({ pottedThisTurn: false, firstHitId: null, nineBallPotted: false });

  // --- Mobile & Responsive Logic ---
  const [windowSize, setWindowSize] = useState({ w: 1000, h: 600 });

  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    handleResize(); // Init
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isPortrait = windowSize.h > windowSize.w;
  // Determine scale factor to fit the game (approx 860x550 design size) into current viewport
  // We add some margin (0.95) to ensure it doesn't touch edges
  const gameScale = Math.min(windowSize.w / 860, windowSize.h / 550, 1) * 0.95;

  // --- Initialization ---

  const startMatch = (selectedMode: BilliardsMode) => {
      if (user.username !== '测试玩家' && !player2 && onOpenP2Login) {
          onOpenP2Login();
          return;
      }

      playSound.click();
      setMode(selectedMode);
      setMatchScore({ p1: 0, p2: 0 });
      setMatchWinner(null);
      initRound();
  };

  const initRound = () => {
    const newBalls: Ball[] = [];
    
    // Cue Ball
    newBalls.push({ id: 0, x: 200, y: TABLE_HEIGHT / 2, vx: 0, vy: 0, active: true, type: 'CUE' });

    const startX = 600;
    const startY = TABLE_HEIGHT / 2;
    const r = BALL_RADIUS;
    const dist = Math.sqrt((2 * r) ** 2 - r ** 2) + 0.5;

    if (mode === '8BALL') {
        const pattern = [
            [1], 
            [2, 9], 
            [3, 8, 10], 
            [4, 15, 12, 5], 
            [6, 7, 13, 14, 11]
        ];
        
        pattern.forEach((row, colIndex) => {
            row.forEach((id, rowIndex) => {
                 const x = startX + colIndex * dist;
                 const y = startY + (rowIndex * 2 * r) - (row.length - 1) * r;
                 
                 let type: Ball['type'] = 'SOLID';
                 if (id > 8) type = 'STRIPE';
                 if (id === 8) type = 'EIGHT';

                 newBalls.push({ id, x: x + Math.random()*0.1, y: y + Math.random()*0.1, vx: 0, vy: 0, active: true, type });
            });
        });
    } else {
        const ids = [1, 2, 3, 9, 5, 6, 7, 8, 4];
        const positions = [
            { c: 0, r: 0 },
            { c: 1, r: -0.5 }, { c: 1, r: 0.5 },
            { c: 2, r: 0 }, 
            { c: 2, r: -1 }, { c: 2, r: 1 },
            { c: 3, r: -0.5 }, { c: 3, r: 0.5 },
            { c: 4, r: 0 }
        ];
        
        positions.forEach((pos, i) => {
            const id = ids[i];
            const x = startX + pos.c * dist;
            const y = startY + pos.r * 2 * r;
            newBalls.push({ 
                id, x: x + Math.random()*0.1, y: y + Math.random()*0.1, vx: 0, vy: 0, active: true, 
                type: id === 9 ? 'NINE' : 'SOLID' 
            });
        });
    }

    setBalls(newBalls);
    ballsRef.current = newBalls;
    setGameState('PLAYING');
    setTurn(1); 
    setWinner(null);
    setPlacingBall(false);
    setFoulMessage(null);
    setPlayerGroups({ 1: null, 2: null });
    turnInfoRef.current = { pottedThisTurn: false, firstHitId: null, nineBallPotted: false };
    soundCooldowns.current = {};
  };

  // --- Physics Engine ---
  const checkPockets = (ball: Ball) => {
      const pockets = [
          { x: 0, y: 0 }, { x: TABLE_WIDTH / 2, y: -8 }, { x: TABLE_WIDTH, y: 0 },
          { x: 0, y: TABLE_HEIGHT }, { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT + 8 }, { x: TABLE_WIDTH, y: TABLE_HEIGHT }
      ];
      for (let p of pockets) {
          const dx = ball.x - p.x;
          const dy = ball.y - p.y;
          if (dx*dx + dy*dy < (POCKET_RADIUS * 1.2)**2) return true;
      }
      return false;
  };

  const updatePhysics = () => {
      let isAnyBallMoving = false;
      const balls = ballsRef.current;
      const pottedInFrame: number[] = [];

      for (let step = 0; step < SUB_STEPS; step++) {
          balls.forEach(b => {
              if (!b.active) return;
              if (placingBall && b.id === 0) return;
              b.x += b.vx / SUB_STEPS; b.y += b.vy / SUB_STEPS;
              const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
              if (speed > 0) {
                  const friction = DECELERATION / SUB_STEPS;
                  const newSpeed = Math.max(0, speed - friction);
                  if (newSpeed < STOP_THRESHOLD) { b.vx = 0; b.vy = 0; } 
                  else { const scale = newSpeed / speed; b.vx *= scale; b.vy *= scale; isAnyBallMoving = true; }
              }
              let wallHit = false;
              if (b.x < BALL_RADIUS) { b.x = BALL_RADIUS; b.vx = Math.abs(b.vx) * WALL_BOUNCE; wallHit = true; }
              if (b.x > TABLE_WIDTH - BALL_RADIUS) { b.x = TABLE_WIDTH - BALL_RADIUS; b.vx = -Math.abs(b.vx) * WALL_BOUNCE; wallHit = true; }
              if (b.y < BALL_RADIUS) { b.y = BALL_RADIUS; b.vy = Math.abs(b.vy) * WALL_BOUNCE; wallHit = true; }
              if (b.y > TABLE_HEIGHT - BALL_RADIUS) { b.y = TABLE_HEIGHT - BALL_RADIUS; b.vy = -Math.abs(b.vy) * WALL_BOUNCE; wallHit = true; }
              
              if (wallHit) {
                  const impactSpeed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
                  if (impactSpeed > 0.5) {
                      const now = Date.now();
                      const soundKey = `wall-${b.id}`;
                      if (!soundCooldowns.current[soundKey] || now - soundCooldowns.current[soundKey] > 50) {
                         playSound.billiardRail(impactSpeed);
                         soundCooldowns.current[soundKey] = now;
                      }
                  }
              }

              if (checkPockets(b)) {
                  b.active = false; b.vx = 0; b.vy = 0;
                  if (!pottedInFrame.includes(b.id)) pottedInFrame.push(b.id);
                  if (b.id === 9) turnInfoRef.current.nineBallPotted = true;
                  playSound.billiardPocket();
              }
          });

          for (let i = 0; i < balls.length; i++) {
              for (let j = i + 1; j < balls.length; j++) {
                  const b1 = balls[i]; const b2 = balls[j];
                  if (!b1.active || !b2.active) continue;
                  if (placingBall && (b1.id === 0 || b2.id === 0)) continue; 
                  const dx = b2.x - b1.x; const dy = b2.y - b1.y;
                  const distSq = dx*dx + dy*dy;
                  if (distSq < (BALL_RADIUS * 2) ** 2) {
                      const dist = Math.sqrt(distSq);
                      const nx = dx / dist; const ny = dy / dist;
                      const overlap = (BALL_RADIUS * 2) - dist;
                      const correction = overlap * 0.5; 
                      b1.x -= nx * correction; b1.y -= ny * correction;
                      b2.x += nx * correction; b2.y += ny * correction;
                      
                      const v1n = b1.vx * nx + b1.vy * ny; const v2n = b2.vx * nx + b2.vy * ny;
                      const tx = -ny; const ty = nx;
                      const v1t = b1.vx * tx + b1.vy * ty; const v2t = b2.vx * tx + b2.vy * ty;
                      const e = BALL_RESTITUTION;
                      const v1n_new = (v1n * (1 - e) + v2n * (1 + e)) / 2;
                      const v2n_new = (v1n * (1 + e) + v2n * (1 - e)) / 2;
                      b1.vx = v1n_new * nx + v1t * tx; b1.vy = v1n_new * ny + v1t * ty;
                      b2.vx = v2n_new * nx + v2t * tx; b2.vy = v2n_new * ny + v2t * ty;
                      
                      const impactForce = Math.abs(v1n - v2n);
                      if (impactForce > 0.1) {
                          const now = Date.now();
                          const pairId = b1.id < b2.id ? `${b1.id}-${b2.id}` : `${b2.id}-${b1.id}`;
                          if (!soundCooldowns.current[pairId] || now - soundCooldowns.current[pairId] > 30) {
                              playSound.billiardHit(impactForce);
                              soundCooldowns.current[pairId] = now;
                          }
                      }
                      if (b1.id === 0 && turnInfoRef.current.firstHitId === null) turnInfoRef.current.firstHitId = b2.id;
                      if (b2.id === 0 && turnInfoRef.current.firstHitId === null) turnInfoRef.current.firstHitId = b1.id;
                  }
              }
          }
      }

      if (pottedInFrame.length > 0) {
          turnInfoRef.current.pottedThisTurn = true;
          handlePotLogic(pottedInFrame);
      }
      setIsMoving(isAnyBallMoving);
      if (!isAnyBallMoving && isMoving) { handleTurnEnd(); }
      setBalls([...balls]);
  };

  const handlePotLogic = (ids: number[]) => {
      if (ids.includes(0)) return;
      if (mode === '8BALL' && playerGroups[1] === null) {
          const firstBall = ids.find(id => id !== 0 && id !== 8);
          if (firstBall) {
              const isSolid = firstBall < 8;
              const type: GroupType = isSolid ? 'SOLIDS' : 'STRIPES';
              const otherType: GroupType = isSolid ? 'STRIPES' : 'SOLIDS';
              setPlayerGroups({ 1: turn === 1 ? type : otherType, 2: turn === 2 ? type : otherType });
          }
      }
      if (mode === '8BALL' && ids.includes(8)) {
          const activeBalls = ballsRef.current.filter(b => b.active && b.id !== 0 && b.id !== 8);
          endRound(activeBalls.length === 0 && turnInfoRef.current.firstHitId ? (turn === 1 ? 'P1' : 'P2') : (turn === 1 ? 'P2' : 'P1'));
      }
  };

  const respawnNineBall = () => {
      const nine = ballsRef.current.find(b => b.id === 9);
      if (nine) {
          const footSpotX = TABLE_WIDTH * 0.75;
          const footSpotY = TABLE_HEIGHT / 2;
          let spawnX = footSpotX;
          let valid = false;
          while (!valid) {
              valid = true;
              for (const b of ballsRef.current) {
                  if (b.active && b.id !== 9) {
                      const dx = b.x - spawnX; const dy = b.y - footSpotY;
                      if (dx*dx + dy*dy < (BALL_RADIUS*2)**2) { valid = false; spawnX += BALL_RADIUS * 2 + 1; break; }
                  }
              }
              if (spawnX > TABLE_WIDTH - BALL_RADIUS) break;
          }
          nine.active = true; nine.x = spawnX; nine.y = footSpotY; nine.vx = 0; nine.vy = 0;
      }
  };

  const handleTurnEnd = () => {
      let foulReason: string | null = null;
      const cue = ballsRef.current.find(b => b.id === 0);
      const ninePotted = turnInfoRef.current.nineBallPotted;
      
      if (!cue || !cue.active) {
          foulReason = "母球落袋";
          if (cue) { cue.active = true; cue.vx = 0; cue.vy = 0; }
      } else if (turnInfoRef.current.firstHitId === null) {
          foulReason = "未击中任何球";
      } else if (mode === '9BALL') {
          const activeBalls = ballsRef.current.filter(b => b.active && b.id !== 0);
          if (turnInfoRef.current.firstHitId !== null) {
              const lowestTarget = ballsRef.current.reduce((minId, b) => {
                  if (b.id === 0) return minId;
                  if (b.active && b.id < (turnInfoRef.current.firstHitId as number)) return Math.min(minId, b.id);
                  return minId;
              }, 99);
              if (lowestTarget < turnInfoRef.current.firstHitId) {
                  foulReason = `击打错误 (需击打 ${lowestTarget}号)`;
              }
          }
      }

      if (mode === '9BALL') {
          if (ninePotted) {
              if (foulReason) {
                  respawnNineBall();
                  foulReason += " (9号球复位)";
              } else {
                  endRound(turn === 1 ? 'P1' : 'P2');
                  return;
              }
          }
      }

      if (foulReason || !turnInfoRef.current.pottedThisTurn) {
          setTurn(turn === 1 ? 2 : 1);
      }
      
      if (foulReason) {
          setFoulMessage(foulReason);
          playSound.wrong();
          setPlacingBall(true);
          setTimeout(() => setFoulMessage(null), 3000);
      }

      turnInfoRef.current = { pottedThisTurn: false, firstHitId: null, nineBallPotted: false };
      setPower(0); setDragStart(null); setCurrentDrag(null);
  };

  const endRound = (winnerName: string) => {
      playSound.win();
      
      const newScore = { ...matchScore };
      if (winnerName === 'P1') newScore.p1 += 1;
      else newScore.p2 += 1;
      
      setMatchScore(newScore);
      setWinner(winnerName);

      const targetWins = Math.ceil(matchConfig.totalFrames / 2);
      
      if (newScore.p1 >= targetWins) {
          setMatchWinner('P1');
          setGameState('GAMEOVER');
          onGameEnd(matchConfig.pointsPerMatch, true, {
              opponent: player2 ? player2.username : 'Player 2',
              opponentAvatar: player2?.avatar,
              score: `${newScore.p1}-${newScore.p2}`,
              matchTags: [`BO${matchConfig.totalFrames}`, mode]
          });
      } else if (newScore.p2 >= targetWins) {
          setMatchWinner('P2');
          setGameState('GAMEOVER');
          onGameEnd(-matchConfig.pointsPerMatch, false, {
              opponent: player2 ? player2.username : 'Player 2',
              opponentAvatar: player2?.avatar,
              score: `${newScore.p1}-${newScore.p2}`,
              matchTags: [`BO${matchConfig.totalFrames}`, mode]
          });
      } else {
          setGameState('ROUND_OVER');
      }
  };

  // --- Aim Guide & Rendering ---
  const calculateTrajectory = (cue: Ball, dx: number, dy: number) => {
      const mag = Math.sqrt(dx*dx + dy*dy);
      if (mag === 0) return null;
      const dirX = dx / mag; const dirY = dy / mag;
      let closestT = 2000; let hitNormalX = 0; let hitNormalY = 0; let hitType: 'WALL' | 'BALL' | null = null; let hitBallId: number | null = null;
      if (dirY < 0) { const t = (BALL_RADIUS - cue.y) / dirY; if (t > 0 && t < closestT) { closestT = t; hitNormalX = 0; hitNormalY = 1; hitType = 'WALL'; } }
      if (dirY > 0) { const t = (TABLE_HEIGHT - BALL_RADIUS - cue.y) / dirY; if (t > 0 && t < closestT) { closestT = t; hitNormalX = 0; hitNormalY = -1; hitType = 'WALL'; } }
      if (dirX < 0) { const t = (BALL_RADIUS - cue.x) / dirX; if (t > 0 && t < closestT) { closestT = t; hitNormalX = 1; hitNormalY = 0; hitType = 'WALL'; } }
      if (dirX > 0) { const t = (TABLE_WIDTH - BALL_RADIUS - cue.x) / dirX; if (t > 0 && t < closestT) { closestT = t; hitNormalX = -1; hitNormalY = 0; hitType = 'WALL'; } }
      ballsRef.current.forEach(b => {
          if (!b.active || b.id === 0) return;
          const ocX = b.x - cue.x; const ocY = b.y - cue.y;
          const projection = ocX * dirX + ocY * dirY;
          if (projection < 0) return; 
          const distSq = (ocX*ocX + ocY*ocY) - (projection*projection);
          if (distSq < (BALL_RADIUS * 2) ** 2) {
              const offset = Math.sqrt((BALL_RADIUS * 2) ** 2 - distSq);
              const t = projection - offset;
              if (t > 0 && t < closestT) { closestT = t; hitType = 'BALL'; hitBallId = b.id; }
          }
      });
      const impactX = cue.x + dirX * closestT; const impactY = cue.y + dirY * closestT;
      let guideX = 0; let guideY = 0;
      if (hitType === 'WALL') { const dot = dirX * hitNormalX + dirY * hitNormalY; guideX = dirX - 2 * dot * hitNormalX; guideY = dirY - 2 * dot * hitNormalY; }
      else if (hitType === 'BALL' && hitBallId !== null) {
          const targetBall = ballsRef.current.find(b => b.id === hitBallId);
          if (targetBall) { const dx = targetBall.x - impactX; const dy = targetBall.y - impactY; const len = Math.sqrt(dx*dx + dy*dy); guideX = dx / len; guideY = dy / len; }
      }
      return { impactX, impactY, hitType, guideX, guideY, hitBallId };
  };

  const renderGroupIcon = (group: GroupType) => {
      if (!group) return null;
      if (group === 'SOLIDS') return <div className="flex gap-1"><div className="w-4 h-4 rounded-full bg-red-500 border border-white/20"></div><div className="w-4 h-4 rounded-full bg-yellow-400 border border-white/20"></div></div>;
      return <div className="flex gap-1"><div className="w-4 h-4 rounded-full bg-red-500 border border-white/20 relative overflow-hidden"><div className="absolute top-1 bottom-1 left-0 right-0 bg-white"></div></div><div className="w-4 h-4 rounded-full bg-blue-500 border border-white/20 relative overflow-hidden"><div className="absolute top-1 bottom-1 left-0 right-0 bg-white"></div></div></div>;
  };

  const drawTable = (ctx: CanvasRenderingContext2D) => {
    const gradient = ctx.createRadialGradient(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 50, TABLE_WIDTH / 2, TABLE_HEIGHT / 2, TABLE_WIDTH * 0.8);
    gradient.addColorStop(0, '#1a7a3e'); gradient.addColorStop(1, '#14532d');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    ctx.lineWidth = 15; ctx.strokeStyle = '#052e16'; ctx.strokeRect(0,0, TABLE_WIDTH, TABLE_HEIGHT);
  };
  const drawPockets = (ctx: CanvasRenderingContext2D) => {
      [{x:0,y:0},{x:TABLE_WIDTH/2,y:-8},{x:TABLE_WIDTH,y:0},{x:0,y:TABLE_HEIGHT},{x:TABLE_WIDTH/2,y:TABLE_HEIGHT+8},{x:TABLE_WIDTH,y:TABLE_HEIGHT}].forEach(p => {
          ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2); ctx.fillStyle = '#0a0a0a'; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x, p.y, POCKET_RADIUS * 0.9, 0, Math.PI * 2); ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.stroke();
      });
  };
  const drawBall = (ctx: CanvasRenderingContext2D, b: Ball) => {
      ctx.beginPath(); ctx.arc(b.x + 2, b.y + 3, BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fill();
      if (placingBall && b.id === 0 && !validPlacement) { ctx.beginPath(); ctx.arc(b.x, b.y, BALL_RADIUS + 4, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2); ctx.fillStyle = b.id === 0 ? '#fdfdfd' : BALL_COLORS[b.id]; ctx.fill();
      if (b.type === 'STRIPE' || (mode === '9BALL' && b.id > 8)) { ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(b.x, b.y, BALL_RADIUS, BALL_RADIUS * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      if (b.id !== 0) { ctx.fillStyle = '#000'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.id.toString(), b.x, b.y + 1); }
  };
  const drawAimAssist = (ctx: CanvasRenderingContext2D, cueBall: Ball) => {
      if (placingBall || !dragStart || !currentDrag) return;
      const dx = dragStart.x - currentDrag.x; const dy = dragStart.y - currentDrag.y;
      const powerVal = Math.min(Math.sqrt(dx*dx + dy*dy) / 6, MAX_POWER); 
      const hit = calculateTrajectory(cueBall, dx, dy);
      if (!hit) return;
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(hit.impactX, hit.impactY); ctx.stroke(); ctx.setLineDash([]); 
      ctx.beginPath(); ctx.arc(hit.impactX, hit.impactY, 3, 0, Math.PI*2); ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; ctx.fill();
      if (hit.guideX !== 0 || hit.guideY !== 0) {
          const startX = hit.hitType === 'WALL' ? hit.impactX : ballsRef.current.find(b => b.id === hit.hitBallId)?.x || hit.impactX;
          const startY = hit.hitType === 'WALL' ? hit.impactY : ballsRef.current.find(b => b.id === hit.hitBallId)?.y || hit.impactY;
          ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2; ctx.moveTo(startX, startY); ctx.lineTo(startX + hit.guideX * 60, startY + hit.guideY * 60); ctx.stroke();
      }
      const angle = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(cueBall.x, cueBall.y); ctx.rotate(angle); 
      const tipX = -(BALL_RADIUS + 10 + (powerVal/MAX_POWER)*150);
      const stickLength = 400;
      const stickGrad = ctx.createLinearGradient(tipX, 0, tipX - stickLength, 0); stickGrad.addColorStop(0, '#eab308'); stickGrad.addColorStop(1, '#000');
      ctx.fillStyle = stickGrad; ctx.fillRect(tipX - stickLength, -2.5, stickLength, 5);
      ctx.restore();
  };

  const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      drawTable(ctx); drawPockets(ctx);
      ballsRef.current.forEach(b => { if (b.active) drawBall(ctx, b); });
      if (!isMoving && gameState === 'PLAYING') {
          const cueBall = ballsRef.current.find(b => b.id === 0);
          if (cueBall && cueBall.active) drawAimAssist(ctx, cueBall);
      }
  };

  const gameLoop = useCallback(() => {
      if (gameState === 'PLAYING') updatePhysics();
      render();
      requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, isMoving, dragStart, currentDrag, placingBall]);

  useEffect(() => {
      requestRef.current = requestAnimationFrame(gameLoop);
      return () => cancelAnimationFrame(requestRef.current);
  }, [gameLoop]);

  // Updated input handling: 
  // With CSS transform scale, getBoundingClientRect() returns the *visual* dimensions.
  // We calculate the scale factor relative to the internal TABLE dimensions.
  const getCanvasPos = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = TABLE_WIDTH / rect.width;
      const scaleY = TABLE_HEIGHT / rect.height;
      
      return { 
          x: (clientX - rect.left) * scaleX, 
          y: (clientY - rect.top) * scaleY 
      };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
      if (isMoving || gameState !== 'PLAYING') return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const pos = getCanvasPos(clientX, clientY);
      const cue = ballsRef.current.find(b => b.id === 0);
      if (placingBall) {
          if (validPlacement) { setPlacingBall(false); playSound.click(); } else { playSound.wrong(); }
          return;
      }
      if (cue && cue.active) { setDragStart({ x: pos.x, y: pos.y }); setCurrentDrag({ x: pos.x, y: pos.y }); }
  };
  
  const handleWheel = (e: React.WheelEvent) => {
      if (!dragStart || !currentDrag || placingBall || isMoving) return;
      const dx = currentDrag.x - dragStart.x; const dy = currentDrag.y - dragStart.y;
      const angleStep = e.deltaY > 0 ? 0.003 : -0.003; 
      const cos = Math.cos(angleStep); const sin = Math.sin(angleStep);
      const newDx = dx * cos - dy * sin; const newDy = dx * sin + dy * cos;
      setCurrentDrag({ x: dragStart.x + newDx, y: dragStart.y + newDy });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!placingBall) return;
        const cue = ballsRef.current.find(b => b.id === 0);
        if (!cue) return;
        let dx = 0; let dy = 0; const step = 2;
        if (e.key === 'ArrowUp') dy = -step; if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step; if (e.key === 'ArrowRight') dx = step;
        if (dx !== 0 || dy !== 0) {
            let nx = Math.max(BALL_RADIUS, Math.min(TABLE_WIDTH - BALL_RADIUS, cue.x + dx));
            let ny = Math.max(BALL_RADIUS, Math.min(TABLE_HEIGHT - BALL_RADIUS, cue.y + dy));
            let overlap = false;
            ballsRef.current.forEach(b => { if (b.id !== 0 && b.active) { const distSq = (b.x - nx)**2 + (b.y - ny)**2; if (distSq < (BALL_RADIUS*2)**2) overlap = true; } });
            cue.x = nx; cue.y = ny; setValidPlacement(!overlap); setBalls([...ballsRef.current]);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placingBall]);

  useEffect(() => {
      const handleWindowMove = (e: MouseEvent | TouchEvent) => {
          const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
          const pos = getCanvasPos(clientX, clientY);
          if (placingBall) {
              const cue = ballsRef.current.find(b => b.id === 0);
              if (cue) {
                  let nx = Math.max(BALL_RADIUS, Math.min(TABLE_WIDTH - BALL_RADIUS, pos.x));
                  let ny = Math.max(BALL_RADIUS, Math.min(TABLE_HEIGHT - BALL_RADIUS, pos.y));
                  cue.x = nx; cue.y = ny;
                  let overlap = false;
                  ballsRef.current.forEach(b => { if (b.id !== 0 && b.active) { const dx = b.x - nx; const dy = b.y - ny; if (dx*dx + dy*dy < (BALL_RADIUS*2)**2) overlap = true; } });
                  setValidPlacement(!overlap); setBalls([...ballsRef.current]);
              }
              return;
          }
          if (!dragStart) return;
          setCurrentDrag(pos);
          const dx = dragStart.x - pos.x; const dy = dragStart.y - pos.y; const dist = Math.sqrt(dx*dx + dy*dy);
          setPower(Math.min(dist / 6, MAX_POWER));
      };
      const handleWindowUp = () => {
          if (placingBall) return; 
          if (dragStart && currentDrag) {
              const dx = dragStart.x - currentDrag.x; const dy = dragStart.y - currentDrag.y; const dist = Math.sqrt(dx*dx + dy*dy); const p = Math.min(dist / 6, MAX_POWER);
              if (p > 1) {
                  const cue = ballsRef.current.find(b => b.id === 0);
                  if (cue) {
                      const angle = Math.atan2(dy, dx);
                      cue.vx = Math.cos(angle) * p * 0.85; cue.vy = Math.sin(angle) * p * 0.85;
                      setIsMoving(true); playSound.billiardShot(p);
                  }
              }
          }
          setDragStart(null); setCurrentDrag(null); setPower(0);
      };
      if (dragStart || placingBall) { window.addEventListener('mousemove', handleWindowMove); window.addEventListener('mouseup', handleWindowUp); window.addEventListener('touchmove', handleWindowMove); window.addEventListener('touchend', handleWindowUp); }
      return () => { window.removeEventListener('mousemove', handleWindowMove); window.removeEventListener('mouseup', handleWindowUp); window.removeEventListener('touchmove', handleWindowMove); window.removeEventListener('touchend', handleWindowUp); };
  }, [dragStart, currentDrag, placingBall]); 

  // Mobile Portrait Prompt
  if (isPortrait) {
      return (
          <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center text-center p-8 animate-zoom-in">
              <div className="text-6xl mb-6 animate-pulse">🔄</div>
              <h2 className="text-2xl font-bold text-white mb-2">请旋转您的设备</h2>
              <p className="text-slate-400">为了获得最佳的台球体验，请使用横屏模式。</p>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[50] bg-slate-950 flex items-center justify-center overflow-hidden">
      {/* Scaler Wrapper: Centers and Scales the entire Game UI */}
      <div 
        className="relative transition-transform duration-300 ease-out origin-center"
        style={{ 
            width: '840px', // Fixed Logical Width
            height: '550px', // Fixed Logical Height
            transform: `scale(${gameScale})` 
        }}
      >
          {/* SETUP UI */}
          {gameState === 'SETUP' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 overflow-hidden">
                <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-700 animate-zoom-in relative text-center w-[500px]">
                <h2 className="text-4xl font-black text-white mb-6 tracking-tighter">台球大师 3D</h2>
                
                {/* Match Configuration */}
                <div className="bg-slate-800/50 p-4 rounded-xl mb-6 text-left border border-slate-700">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">赛制设置</h3>
                    
                    <div className="mb-4">
                        <label className="block text-xs text-slate-500 mb-1">总局数 (奇数)</label>
                        <div className="flex gap-2">
                            {[1, 3, 5, 7].map(num => (
                                <button 
                                    key={num}
                                    onClick={() => setMatchConfig({...matchConfig, totalFrames: num})}
                                    className={`flex-1 py-1 rounded border ${matchConfig.totalFrames === num ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
                                >
                                    BO{num}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-xs text-slate-500 mb-1">单场积分押注</label>
                        <input 
                                type="number" 
                                min="10" 
                                step="10"
                                value={matchConfig.pointsPerMatch}
                                onChange={(e) => setMatchConfig({...matchConfig, pointsPerMatch: Math.max(0, parseInt(e.target.value))})}
                                className="w-full bg-slate-950 border border-slate-600 rounded px-2 py-1 text-white"
                        />
                    </div>

                    <div className="pt-2 border-t border-slate-700">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">对手 (P2)</span>
                            <span className={`font-bold ${player2 ? 'text-white' : 'text-slate-500'}`}>
                                {player2 ? player2.username : (user.username === '测试玩家' ? '测试路人' : '未登录')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <Button onClick={() => startMatch('8BALL')} className="flex-1 py-3 text-lg bg-indigo-600 hover:bg-indigo-500 shadow-none">
                        {user.username !== '测试玩家' && !player2 ? '登录 2P 开始 (8球)' : '开始中式八球'}
                    </Button>
                    <Button onClick={() => startMatch('9BALL')} className="flex-1 py-3 text-lg bg-slate-700 hover:bg-slate-600 shadow-none">
                        {user.username !== '测试玩家' && !player2 ? '登录 2P 开始 (9球)' : '开始美式九球'}
                    </Button>
                </div>
                </div>
            </div>
          )}

          {/* GAMEPLAY UI */}
          {(gameState === 'PLAYING' || gameState === 'ROUND_OVER' || gameState === 'GAMEOVER') && (
              <div className="flex flex-col items-center w-full h-full relative">
                  {/* Scoreboard */}
                  <div className="flex justify-between items-center bg-slate-900/90 backdrop-blur w-full px-6 py-2 rounded-t-xl border-t border-x border-slate-700 shadow-lg z-10">
                      {/* Left: Player 1 */}
                      <div className={`flex flex-col items-center px-4 py-1 rounded-lg transition-colors ${turn === 1 ? 'bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'opacity-40'}`}>
                          <div className="flex items-center gap-3 relative">
                            {/* Streak here */}
                            <StreakIndicator streak={user.stats?.[GameType.BILLIARDS]?.streak || 0} className="absolute -top-4 left-0 scale-75" />
                            <div className="w-10 h-10 rounded-full bg-indigo-600 border border-white/20 overflow-hidden">
                                {user.avatar?.startsWith('data:') ? <img src={user.avatar} className="w-full h-full object-cover"/> : (user.avatar || '👤')}
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-bold text-lg leading-none ${turn === 1 ? 'text-cyan-400' : 'text-slate-400'}`}>{user.username}</span>
                                {renderGroupIcon(playerGroups[1])}
                            </div>
                          </div>
                      </div>
                      
                      {/* Center: Score & Info */}
                      <div className="flex flex-col items-center flex-1">
                        <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-1">
                            BO{matchConfig.totalFrames} • {mode === '8BALL' ? '8-BALL' : '9-BALL'}
                        </div>
                        <div className="flex items-center gap-4 text-3xl font-black text-white leading-none">
                            <span className={turn===1 ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'text-slate-500'}>{matchScore.p1}</span>
                            <span className="text-slate-700 text-xl">-</span>
                            <span className={turn===2 ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'text-slate-500'}>{matchScore.p2}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono h-3">
                            {placingBall ? <span className="text-yellow-400 animate-pulse">自由球 - 请放置</span> : (turnInfoRef.current.firstHitId ? `目标: ${turnInfoRef.current.firstHitId}` : '')}
                        </div>
                      </div>
                      
                      {/* Right: Player 2 */}
                      <div className={`flex flex-col items-center px-4 py-1 rounded-lg transition-colors ${turn === 2 ? 'bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'opacity-40'}`}>
                          <div className="flex items-center gap-3 flex-row-reverse">
                              <div className="w-10 h-10 rounded-full bg-red-600 border border-white/20 flex items-center justify-center text-xl overflow-hidden">
                                  {player2?.avatar?.startsWith('data:') ? <img src={player2.avatar} className="w-full h-full object-cover"/> : (player2?.avatar || '👤')}
                              </div>
                              <div className="flex flex-col items-end">
                                <span className={`font-bold text-lg leading-none ${turn === 2 ? 'text-cyan-400' : 'text-slate-400'}`}>{player2 ? player2.username : 'Player 2'}</span>
                                {renderGroupIcon(playerGroups[2])}
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  {/* Game Container */}
                  <div ref={containerRef} className="relative p-5 bg-[#2a1306] rounded-b-xl shadow-2xl border-x-8 border-b-8 border-[#1a0b02] w-full">
                      <div className="relative rounded-sm overflow-hidden shadow-inner border-4 border-[#14532d] w-full">
                          <canvas 
                            ref={canvasRef} 
                            width={TABLE_WIDTH} 
                            height={TABLE_HEIGHT} 
                            className={`bg-[#1a7a3e] block w-full h-auto ${placingBall ? 'cursor-move' : 'cursor-crosshair'}`} 
                            style={{ touchAction: 'none' }} // Crucial for mobile
                            onMouseDown={handleMouseDown} 
                            onTouchStart={handleMouseDown} 
                            onWheel={handleWheel} 
                          />
                      </div>

                      {foulMessage && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 animate-zoom-in pointer-events-none w-full px-4 text-center">
                             <div className="bg-red-600/90 backdrop-blur-md border-2 border-red-400 text-white px-8 py-4 rounded-xl shadow-2xl shadow-red-900/50 flex flex-col items-center mx-auto max-w-sm">
                                 <span className="text-4xl mb-2">⚠️</span>
                                 <h3 className="text-2xl font-black italic uppercase mb-1">犯规</h3>
                                 <p className="font-bold">{foulMessage}</p>
                             </div>
                        </div>
                      )}
                  </div>
              </div>
          )}

          {/* Round Over Screen */}
          {gameState === 'ROUND_OVER' && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="bg-slate-900 p-8 rounded-2xl border border-white/10 text-center animate-zoom-in shadow-2xl">
                      <h3 className="text-2xl font-bold text-white mb-2">{winner === 'P1' ? user.username : (player2?.username || 'Player 2')} 赢得本局!</h3>
                      <div className="text-4xl font-black text-cyan-400 mb-6">{matchScore.p1} - {matchScore.p2}</div>
                      <Button onClick={initRound} className="w-full py-3 text-lg">下一局</Button>
                  </div>
              </div>
          )}

          {/* Match Over Screen */}
          {gameState === 'GAMEOVER' && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                  <div className="bg-slate-900/90 p-8 rounded-2xl shadow-xl text-center animate-zoom-in border border-white/10 rgb-border" style={{ '--angle': '0deg' } as React.CSSProperties}>
                      <div className="text-6xl mb-4">🏆</div>
                      <h2 className="text-4xl font-bold text-yellow-400 mb-2">{matchWinner === 'P1' ? user.username : (player2?.username || 'Player 2')} 赢得比赛!</h2>
                      <p className="text-slate-400 mb-6">最终比分 {matchScore.p1} : {matchScore.p2}</p>
                      <div className="bg-black/30 p-4 rounded-lg mb-6">
                           <p className="text-sm text-slate-400">奖励积分</p>
                           <p className={`text-2xl font-bold ${matchWinner === 'P1' ? 'text-green-400' : 'text-red-400'}`}>
                               {matchWinner === 'P1' ? '+' : '-'}{matchConfig.pointsPerMatch}
                           </p>
                      </div>
                      <Button onClick={() => setGameState('SETUP')} className="w-full py-3 text-lg bg-indigo-600 hover:bg-indigo-500">返回菜单</Button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
}
import { User, GameType, Achievement } from '../types';

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_blood',
    title: '初露锋芒',
    description: '赢得第一场游戏的胜利',
    icon: '⚔️',
    rarity: 'common'
  },
  {
    id: 'novice_player',
    title: '游戏新秀',
    description: '累计游玩达到 5 场',
    icon: '🎮',
    rarity: 'common'
  },
  {
    id: 'streak_master',
    title: '连胜大师',
    description: '在任意游戏中达成 3 连胜',
    icon: '🔥',
    rarity: 'rare'
  },
  {
    id: 'score_tycoon',
    title: '积分财阀',
    description: '总积分达到 2000 分',
    icon: '💎',
    rarity: 'epic'
  },
  {
    id: 'pool_shark',
    title: '台球杆王',
    description: '赢得一场台球大师比赛',
    icon: '🎱',
    rarity: 'rare'
  },
  {
    id: 'grandmaster',
    title: '一代宗师',
    description: '赢得一场国际象棋或中国象棋比赛',
    icon: '♟️',
    rarity: 'epic'
  },
  {
    id: 'mind_reader',
    title: '读心神探',
    description: '赢得一场猜数字比赛',
    icon: '🧠',
    rarity: 'rare'
  },
  {
    id: 'lucky_hand',
    title: '天选之手',
    description: '赢得一场石头剪刀布',
    icon: '✌️',
    rarity: 'common'
  },
  {
    id: 'veteran',
    title: '身经百战',
    description: '累计游玩达到 50 场',
    icon: '🎖️',
    rarity: 'legendary'
  },
  {
    id: 'night_owl',
    title: '夜猫子',
    description: '在深夜 (23:00-04:00) 赢得一场比赛',
    icon: '🦉',
    rarity: 'rare'
  },
  {
    id: 'social_butterfly',
    title: '社交达人',
    description: '完成一场双人对战 (PVP)',
    icon: '👥',
    rarity: 'common'
  },
  {
    id: 'chess_master',
    title: '棋坛圣手',
    description: '累计赢得 10 场棋类游戏',
    icon: '🏰',
    rarity: 'legendary'
  },
  {
    id: 'billiards_ace',
    title: '清台专家',
    description: '累计赢得 10 场台球比赛',
    icon: '🎯',
    rarity: 'epic'
  }
];

export const checkAchievements = (user: User, lastGameType?: GameType, isWin?: boolean): Achievement[] => {
  const unlocked: Achievement[] = [];
  const existingIds = new Set(user.achievements || []);

  const totalPlayed = Object.values(user.stats || {}).reduce((acc, curr) => acc + curr.played, 0);
  const totalWins = Object.values(user.stats || {}).reduce((acc, curr) => acc + curr.wins, 0);
  const maxStreakAny = Object.values(user.stats || {}).reduce((acc, curr) => Math.max(acc, curr.maxStreak), 0);

  // Logic Checks
  
  // First Blood
  if (!existingIds.has('first_blood') && totalWins >= 1) {
    unlocked.push(ACHIEVEMENTS.find(a => a.id === 'first_blood')!);
  }

  // Novice Player
  if (!existingIds.has('novice_player') && totalPlayed >= 5) {
    unlocked.push(ACHIEVEMENTS.find(a => a.id === 'novice_player')!);
  }

  // Veteran
  if (!existingIds.has('veteran') && totalPlayed >= 50) {
    unlocked.push(ACHIEVEMENTS.find(a => a.id === 'veteran')!);
  }

  // Streak Master
  if (!existingIds.has('streak_master') && maxStreakAny >= 3) {
    unlocked.push(ACHIEVEMENTS.find(a => a.id === 'streak_master')!);
  }

  // Score Tycoon
  if (!existingIds.has('score_tycoon') && user.totalScore >= 2000) {
    unlocked.push(ACHIEVEMENTS.find(a => a.id === 'score_tycoon')!);
  }

  // Game Specific Logic
  if (isWin && lastGameType) {
      const currentHour = new Date().getHours();

      // Night Owl
      if (!existingIds.has('night_owl') && (currentHour >= 23 || currentHour < 4)) {
          unlocked.push(ACHIEVEMENTS.find(a => a.id === 'night_owl')!);
      }

      // Billiards Specific
      if (lastGameType === GameType.BILLIARDS) {
          if (!existingIds.has('pool_shark')) {
              unlocked.push(ACHIEVEMENTS.find(a => a.id === 'pool_shark')!);
          }
          if (!existingIds.has('billiards_ace') && (user.stats?.[GameType.BILLIARDS]?.wins || 0) >= 10) {
              unlocked.push(ACHIEVEMENTS.find(a => a.id === 'billiards_ace')!);
          }
      }

      // Chess/Xiangqi Specific
      if (lastGameType === GameType.CHESS || lastGameType === GameType.XIANGQI) {
          if (!existingIds.has('grandmaster')) {
              unlocked.push(ACHIEVEMENTS.find(a => a.id === 'grandmaster')!);
          }
          const totalChessWins = (user.stats?.[GameType.CHESS]?.wins || 0) + (user.stats?.[GameType.XIANGQI]?.wins || 0);
          if (!existingIds.has('chess_master') && totalChessWins >= 10) {
              unlocked.push(ACHIEVEMENTS.find(a => a.id === 'chess_master')!);
          }
      }

      // Guess Number
      if (lastGameType === GameType.GUESS_NUMBER && !existingIds.has('mind_reader')) {
          unlocked.push(ACHIEVEMENTS.find(a => a.id === 'mind_reader')!);
      }

      // RPS
      if (lastGameType === GameType.RPS && !existingIds.has('lucky_hand')) {
          unlocked.push(ACHIEVEMENTS.find(a => a.id === 'lucky_hand')!);
      }
  }

  // Social Butterfly check
  if (!existingIds.has('social_butterfly') && user.history && user.history.length > 0) {
      const lastMatch = user.history[0];
      // Check if last match was today/just now (timestamp check)
      if (Date.now() - lastMatch.timestamp < 5000) { // Safety buffer
          // Check if opponent was not 'System' and not 'Computer'
          const opponent = lastMatch.details?.opponent;
          if (opponent && opponent !== 'System' && opponent !== 'Computer') {
               unlocked.push(ACHIEVEMENTS.find(a => a.id === 'social_butterfly')!);
          }
      }
  }

  return unlocked;
};
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  const PORT = 3000;

  // In-memory state for real-time performance
  // In a production app, this would be backed by a database/Redis
  const players: Map<string, { id: string; name: string; socketId: string; status: 'lobby' | 'playing' | 'spectating'; points: number; matchesPlayed: string[] }> = new Map();
  const games: Map<string, { id: string; white: string; black: string; whiteName: string; blackName: string; fen: string; whiteTime: number; blackTime: number; lastMoveTime: number; status: 'ongoing' | 'completed' }> = new Map();
  let tournamentStatus: 'waiting' | 'active' | 'ended' = 'waiting';
  let tournamentEndTime: number | null = null;
  let tournamentConfig = { duration: 30, matchTime: 180, maxPlayers: 10 };
  let inviteCode: string | null = null;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminchess123';

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_lobby', ({ name, id, code }) => {
      if (inviteCode && code !== inviteCode) {
        socket.emit('error', 'Invalid invite code');
        return;
      }
      if (players.size >= tournamentConfig.maxPlayers) {
        socket.emit('error', 'Tournament is full');
        return;
      }
      players.set(id, { id, name, socketId: socket.id, status: 'lobby', points: 0, matchesPlayed: [] });
      io.emit('player_list', Array.from(players.values()));
      io.emit('tournament_status', { status: tournamentStatus, endTime: tournamentEndTime, config: tournamentConfig, inviteCode });
    });

    socket.on('create_tournament', (config) => {
      tournamentConfig = config;
      inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      tournamentStatus = 'waiting';
      io.emit('tournament_status', { status: tournamentStatus, endTime: null, config: tournamentConfig, inviteCode });
    });

    socket.on('start_tournament', () => {
      tournamentStatus = 'active';
      tournamentEndTime = Date.now() + tournamentConfig.duration * 60 * 1000;
      io.emit('tournament_status', { status: tournamentStatus, endTime: tournamentEndTime, config: tournamentConfig, inviteCode });
      matchmake();
    });

    socket.on('admin_login', (password) => {
      if (password === ADMIN_PASSWORD) {
        socket.emit('admin_success');
      } else {
        socket.emit('admin_failure', 'Invalid admin password');
      }
    });

    socket.on('move', ({ gameId, move, fen }) => {
      const game = games.get(gameId);
      if (game && game.status === 'ongoing') {
        game.fen = fen;
        game.lastMoveTime = Date.now();
        // Update timers logic would be here
        socket.to(game.white).to(game.black).emit('game_update', game);
        
        // Check for game over
        const chess = new Chess(fen);
        if (chess.isGameOver()) {
          handleGameOver(gameId, chess);
        }
      }
    });

    socket.on('disconnect', () => {
      // Find player by socketId
      for (const [id, player] of players.entries()) {
        if (player.socketId === socket.id) {
          players.delete(id);
          break;
        }
      }
      io.emit('player_list', Array.from(players.values()));
    });
  });

  function matchmake() {
    if (tournamentStatus !== 'active') return;

    const available = Array.from(players.values()).filter(p => p.status === 'lobby');
    
    // Round Robin / Systematic pairing
    // Sort by points to pair competitive players, but avoid repeat matches
    available.sort((a, b) => b.points - a.points);

    for (let i = 0; i < available.length; i++) {
      const p1 = available[i];
      if (p1.status !== 'lobby') continue;

      for (let j = i + 1; j < available.length; j++) {
        const p2 = available[j];
        if (p2.status !== 'lobby') continue;

        // Avoid repeat matches if possible
        if (p1.matchesPlayed.includes(p2.id)) continue;

        const gameId = `game_${Date.now()}_${p1.id}_${p2.id}`;
        const game = {
          id: gameId,
          white: p1.id,
          black: p2.id,
          whiteName: p1.name,
          blackName: p2.name,
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          whiteTime: tournamentConfig.matchTime,
          blackTime: tournamentConfig.matchTime,
          lastMoveTime: Date.now(),
          status: 'ongoing' as const
        };
        
        games.set(gameId, game);
        p1.status = 'playing';
        p2.status = 'playing';
        p1.matchesPlayed.push(p2.id);
        p2.matchesPlayed.push(p1.id);
        
        io.to(p1.socketId).emit('match_found', game);
        io.to(p2.socketId).emit('match_found', game);
        break;
      }
    }
  }

  function handleGameOver(gameId: string, chess: Chess) {
    const game = games.get(gameId);
    if (!game) return;

    game.status = 'completed';
    const p1 = players.get(game.white);
    const p2 = players.get(game.black);

    if (p1) p1.status = 'lobby';
    if (p2) p2.status = 'lobby';

    if (chess.isCheckmate()) {
      const winnerId = chess.turn() === 'w' ? game.black : game.white;
      const winner = players.get(winnerId);
      if (winner) winner.points += 3;
    } else if (chess.isDraw()) {
      if (p1) p1.points += 1;
      if (p2) p2.points += 1;
    }

    io.emit('player_list', Array.from(players.values()));
    setTimeout(matchmake, 5000); // Wait 5s before next match
  }

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Timer countdown loop
  setInterval(() => {
    for (const game of games.values()) {
      if (game.status === 'ongoing') {
        const chess = new Chess(game.fen);
        if (chess.turn() === 'w') {
          game.whiteTime = Math.max(0, game.whiteTime - 1);
        } else {
          game.blackTime = Math.max(0, game.blackTime - 1);
        }

        if (game.whiteTime === 0 || game.blackTime === 0) {
          game.status = 'completed';
          const winnerId = game.whiteTime === 0 ? game.black : game.white;
          const winner = players.get(winnerId);
          if (winner) winner.points += 3;
          
          const p1 = players.get(game.white);
          const p2 = players.get(game.black);
          if (p1) p1.status = 'lobby';
          if (p2) p2.status = 'lobby';
          
          io.emit('player_list', Array.from(players.values()));
          io.to(game.white).to(game.black).emit('game_update', game);
          setTimeout(matchmake, 5000);
        } else {
          io.to(game.white).to(game.black).emit('game_update', game);
        }
      }
    }
  }, 1000);
}

startServer();

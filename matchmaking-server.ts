import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

interface QueuePlayer {
  socketId: string;
  uid: string;
  name: string;
  tournamentId: string;
  status: 'searching' | 'matched';
}

interface ActiveGame {
  matchId: string;
  tournamentId: string;
  white: QueuePlayer;
  black: QueuePlayer;
  startedAt: number;
  status: 'active' | 'finished';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const waitingQueue: QueuePlayer[] = [];
const activeGames: Record<string, ActiveGame> = {};

const findRandomOpponent = (players: QueuePlayer[], uid: string) => {
  const available = players.filter((p) => p.uid !== uid && p.status === 'searching');
  if (available.length === 0) return null;
  const index = Math.floor(Math.random() * available.length);
  return available[index];
};

const pairPlayers = (player1: QueuePlayer, player2: QueuePlayer) => {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [white, black] = Math.random() > 0.5 ? [player1, player2] : [player2, player1];

  const game: ActiveGame = {
    matchId,
    tournamentId: player1.tournamentId,
    white,
    black,
    startedAt: Date.now(),
    status: 'active',
  };

  activeGames[matchId] = game;

  io.to(white.socketId).emit('match_found', {
    matchId,
    color: 'white',
    opponent: { uid: black.uid, name: black.name },
  });

  io.to(black.socketId).emit('match_found', {
    matchId,
    color: 'black',
    opponent: { uid: white.uid, name: white.name },
  });

  io.to(`tournament_${player1.tournamentId}`).emit('active_games_updated', Object.values(activeGames).filter((g) => g.tournamentId === player1.tournamentId));

  return game;
};

const tryMatchmaking = (tournamentId: string) => {
  const tournamentQueue = waitingQueue.filter((player) => player.tournamentId === tournamentId && player.status === 'searching');
  while (tournamentQueue.length >= 2) {
    const first = tournamentQueue.shift()!;
    const secondIndex = Math.floor(Math.random() * tournamentQueue.length);
    const second = tournamentQueue.splice(secondIndex, 1)[0];

    first.status = 'matched';
    second.status = 'matched';
    waitingQueue.splice(waitingQueue.findIndex((p) => p.socketId === first.socketId), 1);
    waitingQueue.splice(waitingQueue.findIndex((p) => p.socketId === second.socketId), 1);
    pairPlayers(first, second);
  }
};

io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id}`);

  socket.on('join_queue', (payload: { uid: string; name: string; tournamentId: string }) => {
    const existingIndex = waitingQueue.findIndex((p) => p.uid === payload.uid && p.tournamentId === payload.tournamentId);
    if (existingIndex >= 0) {
      waitingQueue[existingIndex].socketId = socket.id;
      waitingQueue[existingIndex].status = 'searching';
    } else {
      waitingQueue.push({
        socketId: socket.id,
        uid: payload.uid,
        name: payload.name,
        tournamentId: payload.tournamentId,
        status: 'searching',
      });
    }

    socket.join(`tournament_${payload.tournamentId}`);
    socket.emit('queue_status', { status: 'searching' });
    tryMatchmaking(payload.tournamentId);
  });

  socket.on('leave_queue', (payload: { uid: string; tournamentId: string }) => {
    const index = waitingQueue.findIndex((p) => p.uid === payload.uid && p.tournamentId === payload.tournamentId);
    if (index >= 0) waitingQueue.splice(index, 1);
    socket.emit('queue_status', { status: 'idle' });
  });

  socket.on('finish_game', (payload: { matchId: string; winnerUid: string }) => {
    const game = activeGames[payload.matchId];
    if (!game) return;
    game.status = 'finished';
    io.to(`tournament_${game.tournamentId}`).emit('active_games_updated', Object.values(activeGames).filter((g) => g.tournamentId === game.tournamentId));
  });

  socket.on('disconnect', () => {
    const index = waitingQueue.findIndex((p) => p.socketId === socket.id);
    if (index >= 0) waitingQueue.splice(index, 1);
  });
});

app.get('/', (req, res) => {
  res.send('Matchmaking server is running');
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Matchmaking server listening on port ${PORT}`);
});

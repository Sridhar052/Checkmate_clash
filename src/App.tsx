import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Play, Timer, LogOut, ShieldCheck, Crown, Swords, History } from 'lucide-react';
import { cn } from './lib/utils';
import { Player, Game, TournamentState } from './types';

const socket: Socket = io();
const ChessboardAny = Chessboard as any;

function PlayerRating({ username }: { username: string }) {
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    fetch(`https://api.chess.com/pub/player/${username}/stats`)
      .then(res => res.json())
      .then(data => {
        const r = data.chess_blitz?.last?.rating || data.chess_rapid?.last?.rating;
        if (r) setRating(r);
      })
      .catch(() => {});
  }, [username]);

  if (!rating) return null;
  return <span className="text-[10px] text-[#989795]">Rating: {rating}</span>;
}

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [tournament, setTournament] = useState<TournamentState>({
    status: 'waiting',
    startTime: null,
    endTime: null,
    duration: 30,
  });
  const [playerName, setPlayerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [chess, setChess] = useState(new Chess());
  const [tournamentConfig, setTournamentConfig] = useState({
    duration: 30,
    matchTime: 180,
    maxPlayers: 10
  });

  // Handle player joining
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    
    const id = Math.random().toString(36).substr(2, 9);
    const newPlayer: Player = {
      id,
      name: playerName,
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      isOnline: true,
      lastActive: Date.now(),
    };
    
    setPlayer(newPlayer);
    socket.emit('join_lobby', { name: playerName, id, code: inviteCode });
  };

  const handleCreateTournament = (e: React.FormEvent) => {
    e.preventDefault();
    socket.emit('create_tournament', tournamentConfig);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    socket.emit('admin_login', adminPassword);
  };

  useEffect(() => {
    socket.on('error', (msg: string) => {
      alert(msg);
      setPlayer(null);
    });
    socket.on('admin_success', () => {
      setIsAdmin(true);
      setShowAdminLogin(false);
      // Create a mock admin player so the UI doesn't crash
      const adminPlayer: Player = {
        id: 'admin',
        name: 'Tournament Admin',
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        isOnline: true,
        lastActive: Date.now(),
      };
      setPlayer(adminPlayer);
    });
    socket.on('admin_failure', (msg: string) => {
      setAdminError(msg);
    });
    socket.on('player_list', (list: Player[]) => setPlayers(list));
    socket.on('tournament_status', (status: TournamentState) => setTournament(status));
    socket.on('match_found', (newGame: Game) => {
      setGame(newGame);
      setChess(new Chess(newGame.fen));
    });
    socket.on('game_update', (updatedGame: Game) => {
      setGame(updatedGame);
      setChess(new Chess(updatedGame.fen));
    });

    return () => {
      socket.off('player_list');
      socket.off('tournament_status');
      socket.off('match_found');
      socket.off('game_update');
    };
  }, []);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!game || game.status !== 'ongoing') return false;
    
    const isWhite = game.white === player?.id;
    const isBlack = game.black === player?.id;
    
    if ((chess.turn() === 'w' && !isWhite) || (chess.turn() === 'b' && !isBlack)) {
      return false;
    }

    try {
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // always promote to queen for simplicity
      });

      if (move) {
        setChess(new Chess(chess.fen()));
        socket.emit('move', { gameId: game.id, move, fen: chess.fen() });
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  if (!player) {
    return (
      <div className="min-h-screen bg-[#161512] text-white flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8 bg-[#262421] p-8 rounded-xl shadow-2xl border border-[#3c3a37]"
        >
          <div className="text-center">
            <div className="bg-[#81b64c] w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Crown className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Grandmaster Arena</h1>
            <p className="text-[#989795] mt-2">Enter your name to join the tournament</p>
          </div>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your Username"
              className="w-full bg-[#3c3a37] border-none rounded-lg p-4 text-lg focus:ring-2 focus:ring-[#81b64c] outline-none transition-all"
              maxLength={15}
            />
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite Code (Optional)"
              className="w-full bg-[#3c3a37] border-none rounded-lg p-4 text-lg focus:ring-2 focus:ring-[#81b64c] outline-none transition-all"
              maxLength={10}
            />
            <button
              type="submit"
              className="w-full bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold py-4 rounded-lg text-xl transition-all shadow-lg active:scale-95"
            >
              Join Tournament
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setShowAdminLogin(!showAdminLogin)}
              className="text-[#989795] text-sm hover:text-white transition-colors"
            >
              Admin Login
            </button>
          </div>

          {showAdminLogin && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleAdminLogin} 
              className="space-y-2 pt-4 border-t border-[#3c3a37]"
            >
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Admin Password"
                className="w-full bg-[#3c3a37] border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#81b64c] outline-none"
              />
              {adminError && <p className="text-red-500 text-xs">{adminError}</p>}
              <button
                type="submit"
                className="w-full bg-[#45423e] hover:bg-[#504d49] text-white font-bold py-2 rounded text-sm transition-all"
              >
                Login as Admin
              </button>
            </motion.form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#161512] text-white flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar: Leaderboard & Info */}
      <div className="w-full md:w-80 bg-[#262421] border-r border-[#3c3a37] flex flex-col h-screen">
        <div className="p-4 border-bottom border-[#3c3a37] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="text-[#81b64c] w-5 h-5" />
            <h2 className="font-bold text-lg">Leaderboard</h2>
          </div>
          <div className="text-xs text-[#989795] font-mono">
            {players.length} Players
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="flex items-center justify-between px-3 py-1 text-[10px] text-[#989795] uppercase font-bold tracking-wider border-b border-[#3c3a37] mb-2">
            <span>Player</span>
            <span>Points</span>
          </div>
          {players
            .filter(p => p.id !== 'admin')
            .sort((a, b) => b.points - a.points)
            .map((p, i) => (
            <div 
              key={p.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg transition-colors",
                p.id === player.id ? "bg-[#3c3a37]" : "hover:bg-[#2d2b28]"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-[#989795] font-mono w-4 text-xs">{i + 1}</span>
                <div className="relative">
                  <div className="w-8 h-8 bg-[#45423e] rounded flex items-center justify-center font-bold text-sm">
                    {p.name[0].toUpperCase()}
                  </div>
                  {p.isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#81b64c] border-2 border-[#262421] rounded-full" />}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium truncate max-w-[100px] text-sm">{p.name}</span>
                  <PlayerRating username={p.name} />
                </div>
              </div>
              <div className="font-bold text-[#81b64c]">{p.points}</div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-[#1b1a17] border-t border-[#3c3a37]">
          {isAdmin && tournament.status === 'waiting' && !tournament.inviteCode && (
            <form onSubmit={handleCreateTournament} className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#989795] uppercase">Duration (m)</label>
                  <input 
                    type="number" 
                    value={tournamentConfig.duration}
                    onChange={(e) => setTournamentConfig({...tournamentConfig, duration: parseInt(e.target.value)})}
                    className="w-full bg-[#3c3a37] rounded p-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#989795] uppercase">Match (s)</label>
                  <input 
                    type="number" 
                    value={tournamentConfig.matchTime}
                    onChange={(e) => setTournamentConfig({...tournamentConfig, matchTime: parseInt(e.target.value)})}
                    className="w-full bg-[#3c3a37] rounded p-1 text-sm"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full bg-[#45423e] hover:bg-[#504d49] text-white font-bold py-2 rounded text-sm transition-all"
              >
                Create Room
              </button>
            </form>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[#989795]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-sm">Status: {tournament.status}</span>
              </div>
            </div>
            {tournament.inviteCode && (
              <div className="bg-[#161512] p-2 rounded border border-[#3c3a37] text-center">
                <div className="text-[10px] text-[#989795] uppercase">Invite Code</div>
                <div className="font-mono font-bold text-[#81b64c] text-lg tracking-widest">{tournament.inviteCode}</div>
              </div>
            )}
          </div>

          {isAdmin && tournament.status === 'waiting' && tournament.inviteCode && (
            <button 
              onClick={() => socket.emit('start_tournament')}
              className="w-full mt-4 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold py-2 rounded transition-all"
            >
              Start Tournament
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Game or Lobby */}
      <div className="flex-1 flex flex-col relative">
        {/* Top Bar */}
        <div className="h-16 bg-[#21201d] border-b border-[#3c3a37] flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Crown className="text-[#81b64c] w-6 h-6" />
            <h1 className="font-bold text-xl hidden sm:block">Grandmaster Arena</h1>
          </div>
          
          <div className="flex items-center gap-6">
            {tournament.endTime && (
              <div className="flex items-center gap-2 bg-[#161512] px-4 py-1.5 rounded-full border border-[#3c3a37]">
                <Timer className="w-4 h-4 text-[#81b64c]" />
                <span className="font-mono font-bold">
                  {Math.max(0, Math.floor((tournament.endTime - Date.now()) / 1000 / 60))}:
                  {String(Math.max(0, Math.floor((tournament.endTime - Date.now()) / 1000 % 60))).padStart(2, '0')}
                </span>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="text-[#989795] hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <AnimatePresence mode="wait">
            {game ? (
              <motion.div 
                key="game"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-[600px] space-y-4"
              >
                {/* Opponent Info */}
                <div className="flex items-center justify-between bg-[#262421] p-3 rounded-t-lg border-x border-t border-[#3c3a37]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#45423e] rounded flex items-center justify-center font-bold">
                      {(game.white === player.id ? game.blackName : game.whiteName)?.[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold">{game.white === player.id ? game.blackName : game.whiteName}</div>
                      <div className="text-xs text-[#989795]">Opponent</div>
                    </div>
                  </div>
                  <div className="bg-[#161512] px-4 py-2 rounded font-mono font-bold text-xl border border-[#3c3a37]">
                    {Math.floor((game.white === player.id ? game.blackTime : game.whiteTime) / 60)}:
                    {String((game.white === player.id ? game.blackTime : game.whiteTime) % 60).padStart(2, '0')}
                  </div>
                </div>

                {/* Board */}
                <div className="shadow-2xl rounded-lg overflow-hidden border-4 border-[#262421]">
                  <ChessboardAny 
                    position={chess.fen()} 
                    onPieceDrop={onDrop}
                    boardOrientation={game.white === player.id ? 'white' : 'black'}
                    customDarkSquareStyle={{ backgroundColor: '#779556' }}
                    customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                  />
                </div>

                {/* Player Info */}
                <div className="flex items-center justify-between bg-[#262421] p-3 rounded-b-lg border-x border-b border-[#3c3a37]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#81b64c] rounded flex items-center justify-center font-bold">
                      {player.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold">{player.name}</div>
                      <div className="text-xs text-[#989795]">You</div>
                    </div>
                  </div>
                  <div className="bg-[#161512] px-4 py-2 rounded font-mono font-bold text-xl border border-[#3c3a37]">
                    {Math.floor((game.white === player.id ? game.whiteTime : game.blackTime) / 60)}:
                    {String((game.white === player.id ? game.whiteTime : game.blackTime) % 60).padStart(2, '0')}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="lobby"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center space-y-6"
              >
                <div className="relative">
                  <div className="w-24 h-24 bg-[#262421] rounded-full flex items-center justify-center mx-auto border-4 border-[#81b64c] animate-pulse">
                    <Swords className="w-12 h-12 text-[#81b64c]" />
                  </div>
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 border-t-2 border-[#81b64c] rounded-full"
                  />
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold">In the Lobby</h2>
                  <p className="text-[#989795] mt-2">
                    {tournament.status === 'waiting' 
                      ? "Waiting for the tournament to start..." 
                      : "Searching for your next opponent..."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-8">
                  <div className="bg-[#262421] p-4 rounded-xl border border-[#3c3a37]">
                    <div className="text-[#81b64c] font-bold text-2xl">{player.points}</div>
                    <div className="text-xs text-[#989795] uppercase tracking-wider">Points</div>
                  </div>
                  <div className="bg-[#262421] p-4 rounded-xl border border-[#3c3a37]">
                    <div className="text-white font-bold text-2xl">{player.wins}</div>
                    <div className="text-xs text-[#989795] uppercase tracking-wider">Wins</div>
                  </div>
                  <div className="bg-[#262421] p-4 rounded-xl border border-[#3c3a37]">
                    <div className="text-[#989795] font-bold text-2xl">{player.streak}</div>
                    <div className="text-xs text-[#989795] uppercase tracking-wider">Streak</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Sidebar: History & Chat (Optional) */}
      <div className="hidden lg:flex w-80 bg-[#262421] border-l border-[#3c3a37] flex-col h-screen">
        <div className="p-4 border-bottom border-[#3c3a37] flex items-center gap-2">
          <History className="text-[#989795] w-5 h-5" />
          <h2 className="font-bold text-lg">Match History</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-[#989795] p-8 text-center italic">
          No matches played yet. Join the arena to start your legacy!
        </div>
      </div>
    </div>
  );
}

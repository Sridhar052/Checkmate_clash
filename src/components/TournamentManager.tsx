import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, collection, doc, addDoc, updateDoc, onSnapshot, query, where, getDocs, signIn, logOut } from '../firebase';
import { Trophy, Users, Play, LogIn, LogOut, Plus, UserPlus, Copy, Check, Clock, Eye, Swords, Settings } from 'lucide-react';
import { ChessGame } from './ChessGame';
import { motion, AnimatePresence } from 'motion/react';

export const TournamentManager: React.FC = () => {
  const [user, setUser] = useState(auth.currentUser);
  const [tournament, setTournament] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(30); // minutes
  const [matchTime, setMatchTime] = useState(3); // minutes per player
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editMatchTime, setEditMatchTime] = useState(3);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isSpectating, setIsSpectating] = useState(false);
  const [spectateGameId, setSpectateGameId] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Listen for active tournament the user is part of
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'tournaments'), where('status', 'in', ['waiting', 'started']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userTournament = snapshot.docs.find(doc => {
        const data = doc.data();
        return data.players.some((p: any) => p.uid === user.uid) || data.adminId === user.uid;
      });
      if (userTournament) {
        setTournament({ id: userTournament.id, ...userTournament.data() });
      } else {
        setTournament(null);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for active games in the tournament
  useEffect(() => {
    if (!tournament || tournament.status !== 'started') {
      setActiveGames([]);
      return;
    }
    const q = query(collection(db, 'games'), where('tournamentId', '==', tournament.id), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveGames(games);
      
      // Check if user is in any active game
      const myGame = games.find((g: any) => g.whitePlayerId === user?.uid || g.blackPlayerId === user?.uid);
      if (myGame) {
        setActiveGameId(myGame.id);
      } else {
        setActiveGameId(null);
      }
    });
    return () => unsubscribe();
  }, [tournament, user]);

  useEffect(() => {
    if (tournament) {
      setEditName(tournament.name);
      setEditDuration(tournament.duration);
      setEditMatchTime(tournament.matchTime || 3);
    }
  }, [tournament?.id]);

  const updateSettings = async () => {
    if (!tournament || !user || tournament.adminId !== user.uid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'tournaments', tournament.id), {
        name: editName,
        duration: editDuration,
        matchTime: editMatchTime
      });
      setIsEditingSettings(false);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const createTournament = async () => {
    if (!user) return;
    setLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      await addDoc(collection(db, 'tournaments'), {
        name: `${user.displayName}'s Arena`,
        inviteCode: code,
        adminId: user.uid,
        status: 'waiting',
        players: [{ uid: user.uid, name: user.displayName || 'Anonymous', score: 0, status: 'idle' }],
        duration: duration,
        matchTime: matchTime,
        startTime: null,
        endTime: null
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const joinTournament = async () => {
    if (!user || !inviteCode) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'tournaments'), where('inviteCode', '==', inviteCode.toUpperCase()), where('status', '==', 'waiting'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const tDoc = snapshot.docs[0];
        const tData = tDoc.data();
        if (!tData.players.some((p: any) => p.uid === user.uid)) {
          const newPlayers = [...tData.players, { uid: user.uid, name: user.displayName || 'Anonymous', score: 0, status: 'idle' }];
          await updateDoc(doc(db, 'tournaments', tDoc.id), { players: newPlayers });
        }
      } else {
        alert('Invalid or inactive invite code!');
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const startTournament = async () => {
    if (!tournament || tournament.adminId !== user?.uid) return;
    const startTime = Date.now();
    const endTime = startTime + tournament.duration * 60 * 1000;
    await updateDoc(doc(db, 'tournaments', tournament.id), {
      status: 'started',
      startTime,
      endTime
    });
  };

  const findMatch = async () => {
    if (!tournament || !user) return;
    setLoading(true);
    // Simple pairing: find another idle player
    const idleOpponent = tournament.players.find((p: any) => p.uid !== user.uid && p.status === 'idle');
    if (idleOpponent) {
      // Create game
      const initialTime = (tournament.matchTime || 3) * 60;
      const gameRef = await addDoc(collection(db, 'games'), {
        tournamentId: tournament.id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        whitePlayerId: user.uid,
        blackPlayerId: idleOpponent.uid,
        whitePlayerName: user.displayName,
        blackPlayerName: idleOpponent.name,
        whiteTime: initialTime,
        blackTime: initialTime,
        turn: 'w',
        status: 'active'
      });
      
      // Update player statuses
      const newPlayers = tournament.players.map((p: any) => {
        if (p.uid === user.uid || p.uid === idleOpponent.uid) {
          return { ...p, status: 'playing' };
        }
        return p;
      });
      await updateDoc(doc(db, 'tournaments', tournament.id), { players: newPlayers });
    } else {
      alert('No idle players found. Please wait.');
    }
    setLoading(false);
  };

  const tournamentTimeLeft = useMemo(() => {
    if (!tournament || !tournament.endTime) return 0;
    const left = Math.max(0, Math.floor((tournament.endTime - Date.now()) / 1000));
    return left;
  }, [tournament]);

  const sortedPlayers = useMemo(() => {
    if (!tournament) return [];
    return [...tournament.players].sort((a, b) => b.score - a.score);
  }, [tournament]);

  useEffect(() => {
    if (tournament && tournament.status === 'started' && tournamentTimeLeft === 0) {
      updateDoc(doc(db, 'tournaments', tournament.id), { status: 'finished' });
    }
  }, [tournament, tournamentTimeLeft]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#161512] flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <Trophy className="text-yellow-500 mx-auto mb-6" size={80} />
          <h1 className="text-white text-4xl font-bold mb-4">Chess Arena</h1>
          <button onClick={signIn} className="bg-white text-black px-8 py-4 rounded-xl font-bold flex items-center gap-3 mx-auto">
            <LogIn size={24} /> Sign in to Play
          </button>
        </motion.div>
      </div>
    );
  }

  if (activeGameId) {
    return (
      <ChessGame 
        gameId={activeGameId} 
        isWhite={activeGames.find(g => g.id === activeGameId)?.whitePlayerId === user.uid}
        onExit={() => setActiveGameId(null)}
        tournamentId={tournament?.id}
      />
    );
  }

  if (spectateGameId) {
    return (
      <ChessGame 
        gameId={spectateGameId} 
        isWhite={true} // Doesn't matter for spectator
        onExit={() => setSpectateGameId(null)}
        isSpectator={true}
      />
    );
  }

  if (tournament && tournament.status === 'finished') {
    return (
      <div className="min-h-screen bg-[#161512] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#262421] p-8 rounded-2xl shadow-2xl border border-white/5 text-center max-w-2xl w-full"
        >
          <Trophy className="text-yellow-500 mx-auto mb-6" size={80} />
          <h1 className="text-white text-4xl font-bold mb-2">Tournament Finished!</h1>
          <p className="text-gray-400 mb-8">Final Standings for {tournament.name}</p>
          
          <div className="space-y-4 mb-8">
            {sortedPlayers.map((p, i) => (
              <div key={p.uid} className={`flex items-center justify-between p-4 rounded-xl ${i === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-[#1b1a17]'}`}>
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>{i + 1}</span>
                  <span className="text-white font-bold text-lg">{p.name}</span>
                </div>
                <span className="text-2xl font-bold">{p.score} pts</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setTournament(null)}
            className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all"
          >
            Back to Lobby
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#161512] text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Trophy className="text-yellow-500" size={32} />
            <h1 className="text-2xl font-bold">Grandmaster Arena</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="font-bold">{user.displayName}</p>
              <button onClick={logOut} className="text-gray-400 text-sm hover:text-white">Sign Out</button>
            </div>
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full" alt="" />
          </div>
        </header>

        {!tournament ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/5">
              <Plus className="text-green-500 mb-4" size={48} />
              <h2 className="text-2xl font-bold mb-4">Create Tournament</h2>
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Arena Duration (min)</label>
                  <input 
                    type="number" 
                    value={duration} 
                    onChange={(e) => setDuration(parseInt(e.target.value))}
                    className="w-full bg-[#1b1a17] border border-white/10 rounded-lg p-3"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Match Time (min)</label>
                  <input 
                    type="number" 
                    value={matchTime} 
                    onChange={(e) => setMatchTime(parseInt(e.target.value))}
                    className="w-full bg-[#1b1a17] border border-white/10 rounded-lg p-3"
                  />
                </div>
              </div>
              <button onClick={createTournament} className="w-full py-4 bg-green-600 rounded-xl font-bold">Create Arena</button>
            </div>
            <div className="bg-[#262421] p-8 rounded-2xl border border-white/5">
              <UserPlus className="text-blue-500 mb-4" size={48} />
              <h2 className="text-2xl font-bold mb-4">Join Tournament</h2>
              <input 
                type="text" 
                placeholder="Invite Code" 
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full bg-[#1b1a17] border border-white/10 rounded-lg p-3 mb-6 uppercase"
              />
              <button onClick={joinTournament} className="w-full py-4 bg-blue-600 rounded-xl font-bold">Join Arena</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-[#262421] p-8 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">{tournament.name}</h2>
                    <div className="flex items-center gap-4 text-gray-400">
                      <span className="flex items-center gap-1"><Users size={16} /> {tournament.players.length} Players</span>
                      <span className="flex items-center gap-1"><Clock size={16} /> {tournament.duration}m Arena</span>
                      <span className="flex items-center gap-1"><Swords size={16} /> {tournament.matchTime || 3}m Match</span>
                    </div>
                  </div>
                  {tournament.status === 'waiting' && (
                    <div className="flex flex-col items-end">
                      <span className="text-gray-500 text-xs uppercase font-bold mb-1">Invite Code</span>
                      <div className="flex gap-2">
                        {tournament.adminId === user.uid && (
                          <button 
                            onClick={() => setIsEditingSettings(!isEditingSettings)}
                            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-all"
                            title="Tournament Settings"
                          >
                            <Settings size={20} />
                          </button>
                        )}
                        <button 
                          onClick={() => { navigator.clipboard.writeText(tournament.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} 
                          className="bg-[#1b1a17] px-4 py-2 rounded font-mono font-bold flex items-center gap-2 border border-white/10"
                        >
                          {tournament.inviteCode} {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {isEditingSettings && tournament.adminId === user.uid && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-8 border-b border-white/5 pb-8"
                    >
                      <div className="bg-[#1b1a17] p-6 rounded-xl border border-white/10 space-y-4">
                        <h4 className="text-white font-bold flex items-center gap-2">
                          <Settings size={18} className="text-gray-400" /> Edit Tournament Settings
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-gray-400 text-xs uppercase font-bold mb-1 block">Arena Name</label>
                            <input 
                              type="text" 
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-gray-400 text-xs uppercase font-bold mb-1 block">Arena (min)</label>
                              <input 
                                type="number" 
                                value={editDuration}
                                onChange={(e) => setEditDuration(parseInt(e.target.value))}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-gray-400 text-xs uppercase font-bold mb-1 block">Match (min)</label>
                              <input 
                                type="number" 
                                value={editMatchTime}
                                onChange={(e) => setEditMatchTime(parseInt(e.target.value))}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-green-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button 
                            onClick={updateSettings}
                            disabled={loading}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-all disabled:opacity-50"
                          >
                            {loading ? 'Saving...' : 'Save Settings'}
                          </button>
                          <button 
                            onClick={() => setIsEditingSettings(false)}
                            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {tournament.status === 'waiting' ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="text-gray-400 text-xs uppercase font-bold flex items-center gap-2">
                        <Users size={14} /> Joined Players ({tournament.players.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tournament.players.map((p: any) => (
                          <div key={p.uid} className="flex items-center justify-between bg-[#1b1a17] p-4 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold">
                                {p.name[0]}
                              </div>
                              <span className="text-white font-medium">
                                {p.name} {p.uid === user.uid && '(You)'}
                              </span>
                            </div>
                            {p.uid === tournament.adminId && (
                              <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded font-bold uppercase">Admin</span>
                            )}
                          </div>
                        ))}
                        {tournament.players.length === 0 && (
                          <p className="text-gray-600 italic col-span-2 py-4">No players have joined yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="text-center py-6 border-t border-white/5">
                      {tournament.adminId === user.uid ? (
                        <div className="flex flex-col items-center gap-4">
                          <p className="text-gray-400 text-sm">As admin, you can start the tournament when you're ready.</p>
                          <button 
                            onClick={startTournament} 
                            disabled={tournament.players.length < 2}
                            className="bg-green-600 px-12 py-4 rounded-xl font-bold text-xl flex items-center gap-3 mx-auto hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Play size={24} /> Start Tournament
                          </button>
                          {tournament.players.length < 2 && (
                            <p className="text-orange-500 text-xs font-medium">Need at least 2 players to start</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2 text-yellow-500">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                            <p className="text-xl italic">Waiting for admin to start...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-[#1b1a17] p-6 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                          <Swords size={24} />
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm">Tournament Status</p>
                          <p className="font-bold text-xl">Live Arena</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">Time Remaining</p>
                        <p className="font-mono text-2xl font-bold text-yellow-500">
                          {Math.floor(tournamentTimeLeft / 60)}:{(tournamentTimeLeft % 60).toString().padStart(2, '0')}
                        </p>
                      </div>
                    </div>

                    {!activeGameId && tournament.players.find((p: any) => p.uid === user.uid)?.status === 'idle' && (
                      <button onClick={findMatch} className="w-full py-6 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-all">
                        Find Next Match
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-[#262421] p-8 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Eye size={20} /> Active Games</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeGames.length > 0 ? activeGames.map(game => (
                    <div key={game.id} className="bg-[#1b1a17] p-4 rounded-xl border border-white/5 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-bold">{game.whitePlayerName} vs {game.blackPlayerName}</span>
                        <span className="text-xs text-gray-500">Move {Math.floor(game.fen.split(' ').pop() / 2) || 1}</span>
                      </div>
                      <button onClick={() => setSpectateGameId(game.id)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
                        <Eye size={20} />
                      </button>
                    </div>
                  )) : (
                    <p className="text-gray-600 italic col-span-2 text-center py-4">No active games at the moment.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#262421] p-8 rounded-2xl border border-white/5">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Trophy size={20} className="text-yellow-500" /> Leaderboard</h3>
              <div className="space-y-4">
                {sortedPlayers.map((p, i) => (
                  <div key={p.uid} className={`flex items-center justify-between p-4 rounded-xl ${p.uid === user.uid ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-[#1b1a17]'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-6 text-center font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-gray-600'}`}>{i + 1}</span>
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {p.status === 'playing' && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                      <span className="font-bold text-xl">{p.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { PlayerInfo } from './PlayerInfo';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Eye, Settings, LogOut, Swords } from 'lucide-react';
import { db, doc, onSnapshot, updateDoc, getDoc } from '../firebase';

const ChessboardAny = Chessboard as any;

interface ChessGameProps {
  gameId: string;
  isWhite: boolean;
  onExit: () => void;
  tournamentId?: string;
  isSpectator?: boolean;
}

export const ChessGame: React.FC<ChessGameProps> = ({ 
  gameId, 
  isWhite, 
  onExit, 
  tournamentId, 
  isSpectator = false 
}) => {
  const [game, setGame] = useState(new Chess());
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [gameStatus, setGameStatus] = useState<'active' | 'finished'>('active');
  const [whitePlayerName, setWhitePlayerName] = useState('White');
  const [blackPlayerName, setBlackPlayerName] = useState('Black');
  const [whitePlayerId, setWhitePlayerId] = useState('');
  const [blackPlayerId, setBlackPlayerId] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStatus === 'active') {
      interval = setInterval(() => {
        const turn = game.turn();
        if (turn === 'w') {
          setWhiteTime((prev) => Math.max(0, prev - 1));
        } else {
          setBlackTime((prev) => Math.max(0, prev - 1));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStatus, game.turn()]);

  const handleTimeUp = async (player: 'w' | 'b') => {
    if (gameStatus === 'finished' || isSpectator) return;
    
    // Only the player whose time is up reports it to avoid conflicts
    // Or if it's a spectator, they don't report it
    const isMyTimeUp = (player === 'w' && isWhite) || (player === 'b' && !isWhite);
    if (!isMyTimeUp && !isSpectator) return; 

    const winnerId = player === 'w' ? blackPlayerId : whitePlayerId;
    const winnerName = player === 'w' ? blackPlayerName : whitePlayerName;
    
    const gameRef = doc(db, 'games', gameId);
    await updateDoc(gameRef, {
      status: 'finished',
      winner: `Time's up! ${winnerName} wins.`,
      winnerId: winnerId
    });
    await updateTournamentScores(winnerId, false);
  };

  useEffect(() => {
    if (gameStatus === 'active') {
      if (whiteTime === 0 && whitePlayerId) {
        handleTimeUp('w');
      } else if (blackTime === 0 && blackPlayerId) {
        handleTimeUp('b');
      }
    }
  }, [whiteTime, blackTime, gameStatus, whitePlayerId, blackPlayerId]);

  useEffect(() => {
    const gameRef = doc(db, 'games', gameId);
    const unsubscribe = onSnapshot(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const newGame = new Chess(data.fen);
        setGame(newGame);
        
        // Only sync time if it's significantly different or on turn change
        // This avoids fighting with the local timer
        setWhiteTime(data.whiteTime);
        setBlackTime(data.blackTime);
        
        setGameStatus(data.status);
        setWhitePlayerName(data.whitePlayerName || 'White');
        setBlackPlayerName(data.blackPlayerName || 'Black');
        setWhitePlayerId(data.whitePlayerId);
        setBlackPlayerId(data.blackPlayerId);
        if (data.status === 'finished') {
          setGameOver(data.winner || 'Game Over');
        }
      }
    });
    return () => unsubscribe();
  }, [gameId]);

  const updateTournamentScores = async (winnerId: string | null, isDraw: boolean) => {
    if (!tournamentId) return;
    const tRef = doc(db, 'tournaments', tournamentId);
    const tSnap = await getDoc(tRef);
    if (tSnap.exists()) {
      const tData = tSnap.data();
      const gameRef = doc(db, 'games', gameId);
      const gSnap = await getDoc(gameRef);
      if (!gSnap.exists()) return;
      const gData = gSnap.data();

      const newPlayers = tData.players.map((p: any) => {
        if (p.uid === gData.whitePlayerId || p.uid === gData.blackPlayerId) {
          let newScore = p.score;
          if (isDraw) newScore += 1;
          else if (p.uid === winnerId) newScore += 2;
          return { ...p, score: newScore, status: 'idle' };
        }
        return p;
      });
      await updateDoc(tRef, { players: newPlayers });
    }
  };

  const makeAMove = useCallback(
    async (move: string | { from: string; to: string; promotion?: string }) => {
      if (gameStatus === 'finished' || isSpectator) return null;
      
      const currentTurn = game.turn();
      const isPlayerTurn = (currentTurn === 'w' && isWhite) || (currentTurn === 'b' && !isWhite);
      if (!isPlayerTurn) return null;

      try {
        const gameCopy = new Chess(game.fen());
        const result = gameCopy.move(move);
        if (result) {
          const gameRef = doc(db, 'games', gameId);
          const updateData: any = {
            fen: gameCopy.fen(),
            turn: gameCopy.turn(),
            whiteTime: whiteTime,
            blackTime: blackTime
          };

          if (gameCopy.isGameOver()) {
            updateData.status = 'finished';
            let winnerId = null;
            if (gameCopy.isCheckmate()) {
              const winnerColor = gameCopy.turn() === 'w' ? 'Black' : 'White';
              updateData.winner = `Checkmate! ${winnerColor} wins.`;
              // Get winner ID
              const gSnap = await getDoc(gameRef);
              if (gSnap.exists()) {
                winnerId = winnerColor === 'White' ? gSnap.data().whitePlayerId : gSnap.data().blackPlayerId;
                updateData.winnerId = winnerId;
              }
              await updateTournamentScores(winnerId, false);
            } else if (gameCopy.isDraw()) {
              updateData.winner = 'Draw!';
              await updateTournamentScores(null, true);
            } else {
              updateData.winner = 'Game Over';
              await updateTournamentScores(null, false);
            }
          }

          await updateDoc(gameRef, updateData);
          setLastMove({ from: result.from, to: result.to });
          return result;
        }
      } catch (e) {
        return null;
      }
      return null;
    },
    [game, gameId, isWhite, gameStatus, isSpectator, tournamentId]
  );

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (gameOver || isSpectator) return false;
    makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
    return true;
  }

  function onSquareClick(square: string) {
    if (gameOver || isSpectator) return;
    if (!moveFrom) {
      const moves = game.moves({ square, verbose: true });
      if (moves.length > 0) {
        setMoveFrom(square);
        const newSquares = {};
        moves.forEach((m) => {
          newSquares[m.to] = {
            background: 'radial-gradient(circle, rgba(0,0,0,.1) 20%, transparent 20%)',
            borderRadius: '50%',
          };
        });
        setOptionSquares(newSquares);
      }
      return;
    }

    makeAMove({ from: moveFrom, to: square, promotion: 'q' });
    setMoveFrom(null);
    setOptionSquares({});
  }

  const turn = game.turn();

  return (
    <div className="min-h-screen bg-[#161512] flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        <div className="flex flex-col items-center">
          <PlayerInfo
            name={isWhite ? blackPlayerName : whitePlayerName}
            isActive={turn === (isWhite ? 'b' : 'w') && !gameOver}
            time={isWhite ? blackTime : whiteTime}
            isTop
            onTimeUp={() => handleTimeUp(isWhite ? 'b' : 'w')}
          />

          <div className="relative w-full max-w-[600px] aspect-square shadow-2xl rounded-sm overflow-hidden">
            <ChessboardAny
              id="BasicBoard"
              position={game.fen()}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              animationDuration={200}
              boardOrientation={isWhite ? "white" : "black"}
              customDarkSquareStyle={{ backgroundColor: '#779556' }}
              customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
              customSquareStyles={{
                ...optionSquares,
                ...(lastMove ? {
                  [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.2)' },
                  [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.2)' }
                } : {})
              }}
            />
            
            <AnimatePresence>
              {gameOver && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm"
                >
                  <Trophy className="text-yellow-500 mb-4" size={64} />
                  <h2 className="text-white text-3xl font-bold mb-2">{gameOver}</h2>
                  <button
                    onClick={onExit}
                    className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                  >
                    <LogOut size={20} /> Back to Lobby
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {isSpectator && (
              <div className="absolute top-4 right-4 bg-black/60 px-3 py-1 rounded-full flex items-center gap-2 text-xs font-bold text-white border border-white/10">
                <Eye size={14} /> SPECTATING
              </div>
            )}
          </div>

          <PlayerInfo
            name={isWhite ? whitePlayerName : blackPlayerName}
            isActive={turn === (isWhite ? 'w' : 'b') && !gameOver}
            time={isWhite ? whiteTime : blackTime}
            onTimeUp={() => handleTimeUp(isWhite ? 'w' : 'b')}
          />
        </div>

        <div className="bg-[#262421] rounded-lg p-6 flex flex-col gap-6 shadow-xl border border-white/5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h1 className="text-white text-xl font-bold flex items-center gap-2">
              <Swords className="text-gray-400" size={20} /> Match Info
            </h1>
            <button onClick={onExit} className="text-gray-400 hover:text-white transition-colors">
               <LogOut size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="bg-[#1b1a17] rounded p-4 border border-white/5">
              <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-3">Players</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{whitePlayerName}</span>
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-400">White</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{blackPlayerName}</span>
                  <span className="text-xs bg-black/40 px-2 py-0.5 rounded text-gray-400">Black</span>
                </div>
              </div>
            </div>

            <div className="bg-[#1b1a17] rounded p-4 border border-white/5">
              <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-3">Game Status</h3>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${turn === 'w' ? 'bg-white' : 'bg-gray-600'}`} />
                <span className="text-white font-medium">
                  {gameOver ? 'Game Over' : `${turn === 'w' ? 'White' : 'Black'}'s Turn`}
                </span>
              </div>
              {game.isCheck() && !gameOver && <div className="mt-2 text-red-500 font-bold animate-pulse">Check!</div>}
            </div>
          </div>

          {isSpectator && (
            <p className="mt-auto text-xs text-gray-500 text-center italic">
              You are watching this game as a spectator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

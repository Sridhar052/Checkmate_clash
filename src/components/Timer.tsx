import React, { useEffect, useState } from 'react';

interface TimerProps {
  initialTime: number; // in seconds
  isActive: boolean;
  onTimeUp?: () => void;
}

export const Timer: React.FC<TimerProps> = ({ initialTime, isActive, onTimeUp }) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    setTimeLeft(initialTime);
  }, [initialTime]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      onTimeUp?.();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, onTimeUp]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft < 30;

  return (
    <div
      className={`px-4 py-2 rounded-md font-mono text-2xl font-bold transition-all duration-300 ${
        isActive
          ? 'bg-white text-black shadow-lg scale-105'
          : 'bg-gray-800 text-gray-400'
      } ${isLowTime && isActive ? 'text-red-500 animate-pulse' : ''}`}
    >
      {formatTime(timeLeft)}
    </div>
  );
};

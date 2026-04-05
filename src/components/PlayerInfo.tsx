import React from 'react';
import { User } from 'lucide-react';
import { Timer } from './Timer';

interface PlayerInfoProps {
  name: string;
  rating?: number;
  avatar?: string;
  isActive: boolean;
  time: number;
  isTop?: boolean;
  onTimeUp?: () => void;
}

export const PlayerInfo: React.FC<PlayerInfoProps> = ({
  name,
  rating,
  avatar,
  isActive,
  time,
  isTop = false,
  onTimeUp,
}) => {
  return (
    <div
      className={`flex items-center justify-between w-full max-w-[600px] p-2 ${
        isTop ? 'mb-2' : 'mt-2'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center overflow-hidden">
          {avatar ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <User className="text-gray-400" size={24} />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm md:text-base">
            {name} {rating && <span className="text-gray-400 font-normal">({rating})</span>}
          </span>
          {/* Optional: Country flag or other info */}
        </div>
      </div>
      <Timer initialTime={time} isActive={isActive} onTimeUp={onTimeUp} />
    </div>
  );
};

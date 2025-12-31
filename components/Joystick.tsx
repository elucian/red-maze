
import React from 'react';
import { Direction } from '../types';

interface JoystickProps {
  onDirectionChange: (dir: Direction) => void;
}

export const Joystick: React.FC<JoystickProps> = ({ onDirectionChange }) => {
  const btnClass = "w-14 h-14 md:w-16 md:h-16 bg-blue-900/30 border border-blue-500/50 rounded-xl flex items-center justify-center active:bg-blue-500/60 active:scale-95 text-blue-400 active:text-white text-xl transition-all shadow-[0_0_10px_rgba(59,130,246,0.1)]";
  
  return (
    <div className="flex justify-center p-2">
      <div className="grid grid-cols-3 gap-2 bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">
        <div />
        <button 
          className={btnClass} 
          onPointerDown={(e) => { e.preventDefault(); onDirectionChange(Direction.UP); }}
        >
          <i className="fas fa-chevron-up"></i>
        </button>
        <div />
        <button 
          className={btnClass} 
          onPointerDown={(e) => { e.preventDefault(); onDirectionChange(Direction.LEFT); }}
        >
          <i className="fas fa-chevron-left"></i>
        </button>
        <div className="flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-blue-500/50 animate-pulse"></div>
        </div>
        <button 
          className={btnClass} 
          onPointerDown={(e) => { e.preventDefault(); onDirectionChange(Direction.RIGHT); }}
        >
          <i className="fas fa-chevron-right"></i>
        </button>
        <div />
        <button 
          className={btnClass} 
          onPointerDown={(e) => { e.preventDefault(); onDirectionChange(Direction.DOWN); }}
        >
          <i className="fas fa-chevron-down"></i>
        </button>
        <div />
      </div>
    </div>
  );
};

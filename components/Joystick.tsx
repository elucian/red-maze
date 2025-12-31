
import React from 'react';
import { Direction } from '../types';

interface JoystickProps {
  onDirectionChange: (dir: Direction) => void;
  onAbort?: () => void;
}

export const Joystick: React.FC<JoystickProps> = ({ onDirectionChange, onAbort }) => {
  // Use fixed w/h and shrink-0 to prevent squashing in flex containers
  const btnClass = "w-11 h-11 md:w-14 md:h-14 bg-red-900/20 border border-red-500/30 rounded-lg flex items-center justify-center active:bg-red-500/50 active:scale-95 text-red-400 active:text-white text-lg transition-all shadow-[0_0_8px_rgba(220,38,38,0.1)] shrink-0";
  
  return (
    <div className="flex justify-center p-1">
      <div className="grid grid-cols-3 gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5 shadow-inner">
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
        
        {onAbort ? (
          <button 
            className={`${btnClass} !bg-red-600/20 !border-red-600/50 !text-red-500 text-sm shadow-[0_0_12px_rgba(220,38,38,0.2)]`}
            onPointerDown={(e) => { e.preventDefault(); onAbort(); }}
            title="Abort Link"
          >
            <i className="fas fa-power-off"></i>
          </button>
        ) : (
          <div className="flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-red-500/30 animate-pulse"></div>
          </div>
        )}
        
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

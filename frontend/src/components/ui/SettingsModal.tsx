'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useGameStore } from '../../store/useGameStore';
import { useSocket } from '../../hooks/useSocket';
import { useRouter } from 'next/navigation';
import { 
  X, Volume2, Volume1, Mic, Monitor, Layers, 
  Sparkles, Bug, Keyboard, Info, LogOut,
  Headphones, Zap, Video, Eye, Speaker,
  Gamepad2, Wand2
} from 'lucide-react';

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsOpen, setIsSettingsOpen,
    setIsReportBugOpen, setIsControlsOpen, setIsAboutOpen,
    masterVolume, setMasterVolume,
    gameVolume, setGameVolume,
    ambientVolume, setAmbientVolume,
    micVolume, setMicVolume,
    voiceVolume, setVoiceVolume,
    showFPS, setShowFPS,
    shadowQuality, setShadowQuality,
    vfxQuality, setVfxQuality,
    postProcessing, setPostProcessing,
    performanceMode, setPerformanceMode,
    cardAnimations, setCardAnimations,
    cameraMotion, setCameraMotion,
    cameraSensitivity, setCameraSensitivity,
    autoDeclareUno, setAutoDeclareUno
  } = useSettingsStore();

  const { addToast } = useGameStore();
  const { leaveRoom } = useSocket();
  const router = useRouter();
  
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSettingsOpen) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, setIsSettingsOpen]);

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsSettingsOpen(false);
    }
  };

  if (!isSettingsOpen) return null;

  const handleLeaveLobby = () => {
    setIsSettingsOpen(false);
    leaveRoom();
    router.push('/');
  };

  const SliderField = ({ icon: Icon, label, value, setter, color = "blue" }: any) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300">
          <Icon size={14} className="text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => setter(Number(e.target.value))}
        className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-${color}-500`}
      />
    </div>
  );

  const ToggleField = ({ icon: Icon, label, checked, setter }: any) => (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
      <div className="flex items-center gap-2.5 text-slate-300">
        <Icon size={14} className="text-slate-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <button 
        onClick={() => setter(!checked)}
        className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}
      >
        <motion.div 
          layout
          className="w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm"
          animate={{ left: checked ? 'calc(100% - 18px)' : '2px' }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );

  const SelectorField = ({ icon: Icon, label, options, value, setter, color = "emerald" }: any) => (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
      <div className="flex items-center gap-2 text-slate-300 mb-1">
        <Icon size={14} className="text-slate-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex gap-2">
        {options.map((q: string) => (
          <button
            key={q}
            onClick={() => setter(q)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
              value === q 
                ? `bg-${color}-600/20 text-${color}-400 border border-${color}-500/30` 
                : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-800'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
      onClick={handleOutsideClick}
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-4xl bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-white/15 bg-red-600/20">
          <h2 className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
            <Settings size={20} className="text-white" /> Settings
          </h2>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Audio Settings */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-4 flex items-center gap-2 border-b border-blue-900/30 pb-2">
                  <Volume2 size={12} /> Audio
                </h3>
                <div className="space-y-5">
                  <SliderField icon={Volume2} label="Master Volume" value={masterVolume} setter={setMasterVolume} color="blue" />
                  <SliderField icon={Gamepad2} label="Game Sounds" value={gameVolume} setter={setGameVolume} color="blue" />
                  <SliderField icon={Monitor} label="Ambient Volume" value={ambientVolume} setter={setAmbientVolume} color="green" />
                  <SliderField icon={Mic} label="Microphone Level" value={micVolume} setter={setMicVolume} color="rose" />
                  <SliderField icon={Headphones} label="Voice Chat" value={voiceVolume} setter={setVoiceVolume} color="emerald" />
                </div>
              </div>
            </div>

            {/* Performance Settings */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4 flex items-center gap-2 border-b border-emerald-900/30 pb-2">
                  <Zap size={12} /> Performance
                </h3>
                <div className="space-y-3">
                  <ToggleField icon={Monitor} label="Show FPS Counter" checked={showFPS} setter={setShowFPS} />
                  <ToggleField icon={Zap} label="Performance Mode" checked={performanceMode} setter={setPerformanceMode} />
                  <ToggleField icon={Sparkles} label="Post Processing" checked={postProcessing} setter={setPostProcessing} />
                  
                  <SelectorField 
                    icon={Eye} label="Shadow Quality" 
                    options={['low', 'medium', 'high']} 
                    value={shadowQuality} setter={setShadowQuality} 
                  />
                  <SelectorField 
                    icon={Wand2} label="Visual Effects" 
                    options={['low', 'medium', 'high']} 
                    value={vfxQuality} setter={setVfxQuality} 
                  />
                </div>
              </div>
            </div>

            {/* Gameplay Settings */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-4 flex items-center gap-2 border-b border-amber-900/30 pb-2">
                  <Gamepad2 size={12} /> Gameplay
                </h3>
                <div className="space-y-3">
                  <ToggleField icon={Layers} label="Card Animations" checked={cardAnimations} setter={setCardAnimations} />
                  <ToggleField icon={Video} label="Camera Motion" checked={cameraMotion} setter={setCameraMotion} />
                  
                  <div className="pt-2">
                    <SliderField icon={Eye} label="Camera Sensitivity" value={cameraSensitivity} setter={setCameraSensitivity} color="amber" />
                  </div>

                  <ToggleField icon={Zap} label="Auto Declare UNO" checked={autoDeclareUno} setter={setAutoDeclareUno} />
                </div>
              </div>
            </div>

          </div>

          {/* Quick Actions / Footer inside scroll area */}
          <div className="mt-10 pt-6 border-t border-slate-800/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button 
              onClick={() => { setIsReportBugOpen(true); setIsSettingsOpen(false); }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 transition-colors text-slate-400 hover:text-white group"
            >
              <Bug size={18} className="group-hover:scale-110 transition-transform text-rose-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Report Bug</span>
            </button>
            <button 
              onClick={() => { setIsControlsOpen(true); setIsSettingsOpen(false); }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 transition-colors text-slate-400 hover:text-white group"
            >
              <Keyboard size={18} className="group-hover:scale-110 transition-transform text-blue-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Controls</span>
            </button>
            <button 
              onClick={() => { setIsAboutOpen(true); setIsSettingsOpen(false); }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800 transition-colors text-slate-400 hover:text-white group"
            >
              <Info size={18} className="group-hover:scale-110 transition-transform text-emerald-400" />
              <span className="text-[9px] font-bold uppercase tracking-wider">About</span>
            </button>
            <button 
              onClick={handleLeaveLobby}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 transition-colors text-red-500 hover:text-red-400 group"
            >
              <LogOut size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold uppercase tracking-wider">Leave Room</span>
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

// Assuming Settings icon is missing from the import list in the main block
import { Settings } from 'lucide-react';

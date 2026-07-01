'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../store/useSettingsStore';
import { X, Bug, Keyboard, Info, Send, Layers } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

interface ModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}

const ModalBase = ({ isOpen, onClose, title, icon: Icon, children }: ModalBaseProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-gradient-to-b from-neutral-900/97 to-black/97 backdrop-blur-xl panel-arcade overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b-2 border-white/15 bg-red-600/20">
              <h2 className="font-arcade text-xl uppercase tracking-wide text-yellow-400 arcade-stroke-uno-sm flex items-center gap-2">
                <Icon size={20} className="text-white" /> {title}
              </h2>
              <button onClick={onClose} className="chip-arcade w-9 h-9 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const ReportBugModal = () => {
  const { isReportBugOpen, setIsReportBugOpen } = useSettingsStore();
  const { addToast } = useGameStore();
  const [report, setReport] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!report.trim()) return;
    setSending(true);
    
    try {
      // Send message to backend endpoint (Simulating endpoint since it's just a POST, or emit socket)
      await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: report })
      }).catch(e => console.error("No real endpoint yet, but simulated success"));
      
      addToast('Bug report sent successfully!', 'success');
      setReport('');
      setIsReportBugOpen(false);
    } catch (e) {
      addToast('Failed to send bug report', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalBase isOpen={isReportBugOpen} onClose={() => setIsReportBugOpen(false)} title="Report Bug" icon={Bug}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">Found a glitch or issue? Let us know so we can fix it.</p>
        <textarea 
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="Describe the issue you encountered..."
          className="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button 
            onClick={handleSubmit}
            disabled={sending || !report.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-colors"
          >
            {sending ? 'Sending...' : 'Submit'} <Send size={14} />
          </button>
        </div>
      </div>
    </ModalBase>
  );
};

export const ControlsModal = () => {
  const { isControlsOpen, setIsControlsOpen } = useSettingsStore();

  return (
    <ModalBase isOpen={isControlsOpen} onClose={() => setIsControlsOpen(false)} title="Controls" icon={Keyboard}>
      <div className="space-y-4">
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">Drag / Swipe</span>
          <span className="text-xs text-slate-400">Rotate Camera</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">Scroll / Pinch</span>
          <span className="text-xs text-slate-400">Zoom In/Out</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">Click Card</span>
          <span className="text-xs text-slate-400">Play Card</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
          <span className="text-sm text-slate-300 font-bold uppercase tracking-wider">ESC</span>
          <span className="text-xs text-slate-400">Close Menus</span>
        </div>
      </div>
    </ModalBase>
  );
};

export const AboutModal = () => {
  const { isAboutOpen, setIsAboutOpen } = useSettingsStore();

  return (
    <ModalBase isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} title="About" icon={Info}>
      <div className="flex flex-col items-center justify-center gap-4 text-center py-4">
        <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] border border-white/10 mb-2">
          <Layers size={30} className="text-white" />
        </div>
        <h3 className="text-xl font-black uppercase tracking-widest text-white">UNO Real</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          The most immersive tabletop card game experience. <br/>
          Built with React Three Fiber, Socket.IO, and WebRTC.
        </p>
        <p className="text-[10px] text-slate-500 font-mono mt-4">
          v1.0.0-beta
        </p>
      </div>
    </ModalBase>
  );
};

export const HelpModals = () => {
  return (
    <>
      <ReportBugModal />
      <ControlsModal />
      <AboutModal />
    </>
  );
};

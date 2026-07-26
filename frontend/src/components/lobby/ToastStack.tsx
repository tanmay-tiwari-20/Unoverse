'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

/**
 * Transient notification stack (top-right). Announced politely so screen
 * readers pick up server feedback without stealing focus from the table.
 */
export const ToastStack: React.FC = () => {
  const toasts = useGameStore((s) => s.toasts);
  const removeToast = useGameStore((s) => s.removeToast);

  return (
    <div
      className="fixed top-16 sm:top-4 right-2 sm:right-4 z-[999] flex flex-col gap-2 pointer-events-none max-w-[72vw] sm:max-w-sm w-full safe-x"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl shadow-[0_5px_0_0_rgba(0,0,0,0.3)] border-[3px] ${
              toast.type === 'error'
                ? 'bg-gradient-to-b from-rose-500 to-red-700 border-white text-white'
                : toast.type === 'success'
                  ? 'bg-gradient-to-b from-lime-400 to-green-600 border-white text-white'
                  : 'bg-gradient-to-b from-blue-500 to-blue-700 border-white text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 leading-none select-none">
                {toast.type === 'error'
                  ? <AlertTriangle size={15} />
                  : toast.type === 'success'
                    ? <CheckCircle2 size={15} />
                    : <Info size={15} />}
              </span>
              <span className="font-rounded text-[11px] font-bold tracking-wide leading-tight">
                {toast.message}
              </span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/70 hover:text-white transition-colors ml-4"
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastStack;

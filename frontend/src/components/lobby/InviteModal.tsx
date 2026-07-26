'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Share2, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';

export interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  /** Room code from the URL — the invite link must match the address bar. */
  roomId: string;
}

/**
 * Invite sheet: copy the raw lobby code, copy a deep link, or hand the link to
 * the OS share sheet where one exists (mobile). The link points at the landing
 * page with `?room=`, so a recipient still passes through the name prompt
 * instead of being dropped into a table unnamed.
 */
export const InviteModal: React.FC<InviteModalProps> = ({ open, onClose, roomId }) => {
  const room = useGameStore((s) => s.room);
  const addToast = useGameStore((s) => s.addToast);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = () =>
    `${window.location.origin}/?room=${encodeURIComponent(roomId.toUpperCase())}`;

  const handleCopyCodeOnly = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId.toUpperCase());
    setCopiedCode(true);
    addToast('Lobby code copied!', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLinkOnly = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(inviteLink());
    setCopiedLink(true);
    addToast('Invitation link copied!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareLink = async () => {
    if (!roomId) return;
    const link = inviteLink();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Unoverse Table!',
          text: `Join my Unoverse table! Room Code: ${roomId.toUpperCase()}`,
          url: link,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(link);
      addToast('Link copied to clipboard for sharing!', 'success');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-full max-w-md panel-arcade bg-gradient-to-b from-neutral-900 to-black p-6 relative text-white"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 chip-arcade w-8 h-8 flex items-center justify-center text-white bg-gradient-to-b from-rose-500 to-red-700 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              title="Close"
              aria-label="Close invite modal"
            >
              <X size={14} />
            </button>

            <h3 className="font-arcade text-lg sm:text-xl text-yellow-400 tracking-wider mb-6 text-center uppercase arcade-stroke-uno-sm">
              Invite Friends
            </h3>

            <div className="flex flex-col items-center gap-6">
              {/* Lobby Code Display */}
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="font-arcade text-[10px] tracking-wider text-slate-400 uppercase">
                  Lobby Code
                </span>
                <div className="font-arcade text-3xl sm:text-4xl text-yellow-300 tracking-widest text-center py-2.5 px-7 bg-black/40 border border-neutral-800 rounded-lg select-all">
                  {room?.code}
                </div>
              </div>

              {/* Stack of action buttons */}
              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={handleCopyCodeOnly}
                  className={`btn-arcade py-3 text-xs uppercase cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 font-arcade tracking-wider bg-gradient-to-b ${
                    copiedCode
                      ? 'from-lime-400 to-green-600 text-white'
                      : 'from-blue-400 to-blue-600 text-white hover:border-yellow-400'
                  }`}
                >
                  {copiedCode ? <Check size={14} className="stroke-[3]" /> : <Copy size={14} />}
                  {copiedCode ? 'Code Copied!' : 'Copy Code'}
                </button>

                <button
                  onClick={handleCopyLinkOnly}
                  className={`btn-arcade py-3 text-xs uppercase cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 font-arcade tracking-wider bg-gradient-to-b ${
                    copiedLink
                      ? 'from-lime-400 to-green-600 text-white'
                      : 'from-fuchsia-500 to-purple-700 text-white hover:border-yellow-400'
                  }`}
                >
                  {copiedLink ? <Check size={14} className="stroke-[3]" /> : <Copy size={14} />}
                  {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
                </button>

                <button
                  onClick={handleShareLink}
                  className="btn-arcade py-3 text-xs uppercase cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 font-arcade tracking-wider bg-gradient-to-b from-amber-500 to-orange-600 text-white hover:border-yellow-400"
                >
                  <Share2 size={14} />
                  Share Invite
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default InviteModal;

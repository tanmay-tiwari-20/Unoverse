'use client';

import React, { useState } from 'react';
import { Check, Copy, Link2, Share2, Ticket, Users } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { usePlatformInviteLink } from '../../hooks/usePlatformInviteLink';
import { Button, IconButton, Modal, ModalBody, ModalFooter, ModalHeader, SectionLabel } from '../ui/kit';

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
 *
 * Structure follows the two things a player actually does here, in the order
 * they do them: READ the code out loud, or SEND the link. The old version gave
 * three identically-loud full-width arcade buttons equal weight, so neither
 * task led; now the code is the hero (large, selectable, with its own copy
 * affordance), the link sits under it as a real, verifiable value rather than
 * an invisible thing a button promises to copy, and Share is the single primary
 * action in the footer.
 */
export const InviteModal: React.FC<InviteModalProps> = ({ open, onClose, roomId }) => {
  const room = useGameStore((s) => s.room);
  const addToast = useGameStore((s) => s.addToast);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // The link to hand out. Identical to the old `?room=` deep link on web; on
  // CrazyGames it resolves to a platform invite so the recipient stays inside the
  // portal. One value feeds copy, share and the on-screen text, so what the
  // player reads is always what they send.
  const shownLink = usePlatformInviteLink(roomId, open);
  const inviteLink = () => shownLink;

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

  const code = room?.code ?? roomId.toUpperCase();

  return (
    <Modal open={open} onClose={onClose} size="sm" labelledBy="invite-title">
      <ModalHeader
        id="invite-title"
        title="Invite Friends"
        subtitle="Anyone with the code can join this table"
        icon={<Users size={18} aria-hidden="true" />}
        onClose={onClose}
        closeLabel="Close invite"
      />

      <ModalBody>
        {/* ---- The code. The one thing you read out over voice chat, so it is
             the largest element on the surface and stays selectable. ---- */}
        <section className="flex flex-col gap-1.5">
          <SectionLabel icon={<Ticket size={11} aria-hidden="true" />}>Lobby code</SectionLabel>
          <div className="ui-code flex items-center gap-2 py-2 pl-3 pr-2">
            <span
              className="font-arcade min-w-0 flex-1 select-all text-center text-[clamp(1.5rem,1.1rem+3vw,2.25rem)] leading-none tracking-[0.18em] text-yellow-300"
              /* Read as one word, not six letters, by a screen reader. */
              aria-label={`Lobby code ${code}`}
            >
              {code}
            </span>
            <IconButton
              label={copiedCode ? 'Lobby code copied' : 'Copy lobby code'}
              tone={copiedCode ? 'success' : 'ghost'}
              onClick={handleCopyCodeOnly}
            >
              {copiedCode ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />}
            </IconButton>
          </div>
        </section>

        {/* ---- The link. Shown, not just promised — a read-only field you can
             verify, select by hand, or copy with one tap. ---- */}
        <section className="flex flex-col gap-1.5">
          <SectionLabel icon={<Link2 size={11} aria-hidden="true" />}>Invite link</SectionLabel>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shownLink}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="ui-input min-w-0 flex-1 px-2.5 text-[11px]"
              style={{ height: 'var(--ui-tap)' }}
            />
            <IconButton
              label={copiedLink ? 'Invite link copied' : 'Copy invite link'}
              tone={copiedLink ? 'success' : 'ghost'}
              onClick={handleCopyLinkOnly}
            >
              {copiedLink ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />}
            </IconButton>
          </div>
          <p className="font-rounded px-0.5 text-[10px] font-bold leading-snug text-white/40">
            The link opens the lobby and asks for their name first — nobody lands at the table
            unnamed.
          </p>
        </section>
      </ModalBody>

      <ModalFooter>
        <Button tone="neutral" onClick={onClose} className="flex-1">
          Done
        </Button>
        <Button
          tone="primary"
          onClick={handleShareLink}
          icon={<Share2 size={15} aria-hidden="true" />}
          className="flex-1"
        >
          Share
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default InviteModal;

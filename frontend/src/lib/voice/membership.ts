import type { VoiceParticipant } from '../../store/useVoiceStore';

/** A muted mic is still a participant; an unjoined client has no mesh. */
export function voicePeerIds(
  room: { code: string; players: Array<{ id: string; uid: string; isBot?: boolean }> } | null,
  voice: { participation: string; voiceRoomCode: string | null; participants: VoiceParticipant[] },
  selfId: string,
): Set<string> {
  const ids = new Set<string>();
  if (!room || !selfId || voice.participation !== 'joined' || voice.voiceRoomCode !== room.code) return ids;
  const humans = new Map(room.players.filter((p) => !p.isBot).map((p) => [p.id, p.uid]));
  if (!voice.participants.some((p) => p.playerId === selfId && humans.get(selfId) === p.seatUid)) return ids;
  for (const p of voice.participants) {
    if (p.playerId !== selfId && humans.get(p.playerId) === p.seatUid) ids.add(p.playerId);
  }
  return ids;
}

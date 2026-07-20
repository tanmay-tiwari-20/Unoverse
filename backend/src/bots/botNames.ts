/**
 * Predefined bot display names. Every name contains "Bot" so players can always
 * tell they're playing against the computer, while still reading like a real
 * player name (no "Bot 1" / "CPU" style placeholders).
 *
 * Avatars: the client renders avatars procedurally from the player's name (the
 * existing avatar pool of shirts/skin tones/hair styles is selected by a name
 * hash). Randomly assigning a name therefore also randomly assigns an avatar
 * from the existing pool — no separate avatar plumbing is needed.
 */
export const BOT_NAMES: readonly string[] = [
  'AlexBot',
  'BotMaya',
  'EthanBot',
  'BotNova',
  'SophiaBot',
  'ZaraBot',
  'NoahBot',
  'BotAtlas',
  'LunaBot',
  'KaiBot',
  'BotPixel',
  'OrionBot',
  'AriaBot',
  'BotBlaze',
  'MiloBot',
  'BotJuno',
  'IvyBot',
  'BotComet',
];

/**
 * Pick a random bot name that is not already used in the room (case-insensitive
 * against every current player/spectator name). If the whole pool is somehow
 * exhausted, fall back to a numbered variant that still contains "Bot".
 */
export function pickBotName(takenNames: string[]): string {
  const taken = new Set(takenNames.map((n) => n.toLowerCase()));
  const available = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  for (let i = 2; ; i++) {
    const candidate = `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

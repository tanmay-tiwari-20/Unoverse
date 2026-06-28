const fs = require('fs');

function patchFile(file, targets, inserts) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (let i=0; i<targets.length; i++) {
    if (content.includes(targets[i])) {
      content = content.replace(targets[i], inserts[i]);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, content);
}

patchFile('/Users/uday/uno-real/frontend/src/components/table/WebGLCards.tsx',
  ["const { room, player, currentPlayerId, playerCards, discardPile, drawPileCount, gameStatus } = useGameStore();",
   "const isMyTurn = currentPlayerId === player?.id && (gameStatus === 'playing' || gameStatus === 'awaiting_color_selection');"],
  ["const { room, player, currentPlayerId, playerCards, discardPile, drawPileCount, gameStatus, isProcessing } = useGameStore();",
   "const isMyTurn = currentPlayerId === player?.id && (gameStatus === 'playing' || gameStatus === 'awaiting_color_selection') && !isProcessing;"]
);


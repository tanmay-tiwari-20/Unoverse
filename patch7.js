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

patchFile('/Users/uday/uno-real/frontend/src/components/table/PlayerHandHUD.tsx',
  ['const { room, player, currentPlayerId, playerCards } = useGameStore();', 'const isMyTurn = currentPlayerId === player.id;'],
  ['const { room, player, currentPlayerId, playerCards, isProcessing } = useGameStore();', 'const isMyTurn = currentPlayerId === player.id && !isProcessing;']
);

patchFile('/Users/uday/uno-real/frontend/src/components/table/TableScene.tsx',
  ["const isMyTurn = currentPlayerId === player?.id && room?.status === 'playing';"],
  ["const isMyTurn = currentPlayerId === player?.id && room?.status === 'playing' && !isProcessing;"]
);


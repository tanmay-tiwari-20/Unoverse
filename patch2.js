const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/components/table/PlayerHandHUD.tsx';
let content = fs.readFileSync(file, 'utf8');

const logStatement = `
  console.log("DIAGNOSTICS HUD:", {
    playerId: player?.id,
    seat: player?.seatNumber,
    cardsCount: cardCount,
    renderingHand: cardCount > 0,
    roomStatus: room?.status,
    gameStatus: room ? ['playing', 'awaiting_color_selection'].includes(room.status) : false
  });
`;

content = content.replace('const isMyTurn = currentPlayerId === player.id;', 'const isMyTurn = currentPlayerId === player.id;' + logStatement);

fs.writeFileSync(file, content);

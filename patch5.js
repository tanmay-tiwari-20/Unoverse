const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/hooks/useSocket.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `if (payload.lastAction && !isInitialLoad) {`;
const insertStr = `
        // Sync non-card states immediately to prevent "It is not your turn" desync
        // This ensures the UI instantly hides "YOUR TURN" and prevents double-plays
        useGameStore.setState({
          currentPlayerId: payload.currentPlayerId,
          currentPlayerSeat: payload.currentPlayerSeat,
          direction: payload.direction,
          wildColor: payload.wildColor,
          gameStatus: payload.gameStatus,
          colorChooserId: payload.colorChooserId,
          winnerId: payload.winnerId,
          winnerName: payload.winnerName,
          unoCalled: payload.unoCalled
        });
`;

if (content.includes(targetStr) && !content.includes('Sync non-card states immediately')) {
  content = content.replace(targetStr, targetStr + insertStr);
  fs.writeFileSync(file, content);
}

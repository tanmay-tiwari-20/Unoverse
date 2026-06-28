const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/hooks/useSocket.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `const numPlayers = playersList.length || 2;`;
const insertStr = `
      // If initial state load, merge immediately to prevent massive simultaneous fly-in overlaps
      // and to avoid deadlocks when joining mid-game
      const isInitialLoad = state.gameStatus !== 'playing' || state.discardPile.length === 0;

      if (isInitialLoad) {
        setGameState(payload);
        return;
      }
`;

content = content.replace(targetStr, targetStr + insertStr);
fs.writeFileSync(file, content);

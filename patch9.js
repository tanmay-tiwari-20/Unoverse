const fs = require('fs');

const file1 = '/Users/uday/uno-real/frontend/src/hooks/useSocket.ts';
let content1 = fs.readFileSync(file1, 'utf8');

const target1 = `    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('play-card', { cardId });
    }`;
const insert1 = `    if (socket) {
      console.log({
        clickedBy: state.player?.name,
        clickedById: state.player?.id,
        currentTurn: state.room?.players?.find(p => p.id === state.currentPlayerId)?.name,
        currentTurnId: state.currentPlayerId,
        cardId,
        socketId: socket.id
      });
      useGameStore.setState({ isProcessing: true });
      socket.emit('play-card', { cardId });
    }`;

content1 = content1.replace(target1, insert1);
fs.writeFileSync(file1, content1);

const file2 = '/Users/uday/uno-real/backend/src/index.ts';
let content2 = fs.readFileSync(file2, 'utf8');

const target2 = `      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      console.log(\`[CARD_PLAYED] Player: \${playerName}, Card: \${cardId}\`);`;

const insert2 = `      const player = room.players.find(p => p.id === socket.id);
      const playerName = player ? player.name : 'Unknown';
      console.log(\`[CARD_PLAYED] Player: \${playerName}, Card: \${cardId}\`);
      const playRequestPlayer = socket.id;
      const currentTurnPlayer = room.game.currentPlayerId;
      console.log({
        playRequestPlayer,
        currentTurnPlayer,
        match: playRequestPlayer === currentTurnPlayer
      });`;

content2 = content2.replace(target2, insert2);
fs.writeFileSync(file2, content2);

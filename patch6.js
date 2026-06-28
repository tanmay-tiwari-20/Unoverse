const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/hooks/useSocket.ts';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `  const playCard = (cardId: string) => {
    if (socket) {
      socket.emit('play-card', { cardId });
    }
  };`;
const insertStr = `  const playCard = (cardId: string) => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;

    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('play-card', { cardId });
    }
  };`;

content = content.replace(targetStr, insertStr);

const targetStr2 = `  const drawCard = () => {
    if (socket) {
      socket.emit('draw-card');
    }
  };`;
const insertStr2 = `  const drawCard = () => {
    const state = useGameStore.getState();
    if (state.isProcessing) return;

    if (socket) {
      useGameStore.setState({ isProcessing: true });
      socket.emit('draw-card');
    }
  };`;

content = content.replace(targetStr2, insertStr2);

fs.writeFileSync(file, content);

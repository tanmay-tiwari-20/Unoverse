const fs = require('fs');

const file = '/Users/uday/uno-real/frontend/src/hooks/useSocket.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `socket.emit('play-card', { cardId });`;
const insert1 = `socket.emit('play-card', { cardId, playerId: state.player?.id });`;
content = content.replace(target1, insert1);

fs.writeFileSync(file, content);

const backendFile = '/Users/uday/uno-real/backend/src/index.ts';
let backendContent = fs.readFileSync(backendFile, 'utf8');
const target2 = `socket.on('play-card', ({ cardId }: { cardId: string }) => {`;
const insert2 = `socket.on('play-card', ({ cardId, playerId }: { cardId: string; playerId: string }) => {`;
backendContent = backendContent.replace(target2, insert2);

fs.writeFileSync(backendFile, backendContent);

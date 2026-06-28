const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/components/table/WebGLCards.tsx';
let content = fs.readFileSync(file, 'utf8');

const logStatement = `
        console.log("DIAGNOSTICS:", {
          playerId: player?.id,
          socketId: occupant.id,
          seat: occupant.seatNumber,
          isLocal,
          cardsCount: cardCount,
          renderingHand: !isLocal && cardCount > 0
        });
`;

content = content.replace('const cardCount = hand.length;', 'const cardCount = hand.length;' + logStatement);

fs.writeFileSync(file, content);

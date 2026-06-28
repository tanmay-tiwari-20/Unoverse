const fs = require('fs');
const file = '/Users/uday/uno-real/frontend/src/store/useGameStore.ts';
let content = fs.readFileSync(file, 'utf8');

const debugCode = `
if (typeof window !== 'undefined') {
  (window as any).debugStore = useGameStore;
}
`;
if (!content.includes('debugStore')) {
  content += debugCode;
  fs.writeFileSync(file, content);
}

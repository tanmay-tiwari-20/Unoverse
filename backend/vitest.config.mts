import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Engine tests are pure logic — no DOM needed.
    environment: 'node',
    // Co-located *.test.ts / *.spec.ts files under src/.
    include: ['src/**/*.{test,spec}.ts'],
    // The legacy standalone fuzz script self-executes on import (it calls
    // runSimulation() at module load and console.logs a report), so exclude it
    // from the Vitest run — it remains runnable via `npm run sim`.
    exclude: ['src/game/engine/gameSimulation.test.ts', 'node_modules/**', 'dist/**'],
  },
});

import { createRequire } from 'node:module';

// Only this fixture's parent owns the IPC channel. Invoke normal shutdown from
// inside the child so it can stop its own Next workers and drain backend writes.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  if (process.listenerCount('SIGTERM')) process.emit('SIGTERM');
  else process.exit(0);
}
process.on('message', (message) => { if (message === 'shutdown') shutdown(); });
// An interrupted parent closes IPC. Keep its servers from outliving the run.
process.on('disconnect', shutdown);
const entry = process.argv[2];
process.argv = [process.execPath, entry, ...process.argv.slice(3)];
createRequire(import.meta.url)(entry);

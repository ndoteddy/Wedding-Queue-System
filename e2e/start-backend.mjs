// Starts the API against a throwaway e2e database (deleted first so the 10 mock guests are fresh).
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend');
const db = path.join(backend, 'e2e.db');
for (const f of [db, `${db}-shm`, `${db}-wal`]) rmSync(f, { force: true });

const child = spawn('dotnet', ['run', '--no-launch-profile', '--urls', 'http://localhost:5277'], {
  cwd: backend,
  stdio: 'inherit',
  env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', ConnectionStrings__Default: `Data Source=${db}`, Smtp__Host: '' },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
child.on('exit', code => process.exit(code ?? 0));

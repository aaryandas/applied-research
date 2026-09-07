import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const executableByPlatform = {
  darwin: join(
    'dist',
    process.arch === 'arm64' ? 'mac-arm64' : 'mac',
    'Applied Research.app',
    'Contents',
    'MacOS',
    'Applied Research',
  ),
  win32: join(
    'dist',
    process.arch === 'arm64' ? 'win-arm64-unpacked' : 'win-unpacked',
    'Applied Research.exe',
  ),
  linux: join(
    'dist',
    process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
    'applied-research',
  ),
};
const executable = executableByPlatform[process.platform];
if (!executable || !existsSync(executable)) {
  throw new Error('Packaged application not found. Run npm run package first.');
}
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test'],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_EXECUTABLE_PATH: resolve(executable) },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);

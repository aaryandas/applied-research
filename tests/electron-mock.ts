import { Buffer } from 'node:buffer';
import { vi } from 'vitest';

let encryptionAvailable = true;

export const net = {
  fetch:
    vi.fn<(input: string | Request, init?: RequestInit) => Promise<Response>>(),
};
export const shell = {
  openExternal: vi.fn(async (url: string) => void url),
};
export const safeStorage = {
  decryptString: vi.fn((value: Buffer) => {
    const serialized = value.toString('utf8');
    if (!serialized.startsWith('cipher:')) throw new Error('corrupt');
    return serialized.slice('cipher:'.length);
  }),
  encryptString: vi.fn((value: string) =>
    Buffer.from('cipher:' + value, 'utf8'),
  ),
  getSelectedStorageBackend: vi.fn(() => 'keychain'),
  isEncryptionAvailable: vi.fn(() => encryptionAvailable),
};
export const app = { userAgentFallback: 'Applied Research synthetic SDK test' };
export const webContents = { getFocusedWebContents: vi.fn(() => null) };
export const BrowserWindow = { getAllWindows: vi.fn(() => []) };
export const ipcMain = { handle: vi.fn() };
export const protocol = {
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
};
export const session = { defaultSession: {} };

export const electronTestControl = {
  setEncryptionAvailable(value: boolean) {
    encryptionAvailable = value;
  },
};

export default {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
  webContents,
};

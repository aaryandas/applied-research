import { contextBridge } from 'electron';
import type { DesktopBridge } from '../contracts/desktop';

const desktop: DesktopBridge = {
  info: {
    platform: process.platform,
    electronVersion: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);

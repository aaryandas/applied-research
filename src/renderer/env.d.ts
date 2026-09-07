import type { DesktopBridge } from '../contracts/desktop';

declare global {
  interface Window {
    readonly desktop: DesktopBridge;
  }
}

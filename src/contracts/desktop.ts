export interface DesktopInfo {
  readonly platform: string;
  readonly electronVersion: string;
}

export interface DesktopBridge {
  readonly info: DesktopInfo;
}

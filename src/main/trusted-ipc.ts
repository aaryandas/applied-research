export function assertTrustedRendererEvent(
  event: {
    sender: unknown;
    senderFrame: unknown;
  },
  window: { webContents: { mainFrame: unknown } },
): void {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  ) {
    throw new Error('Untrusted application request.');
  }
}

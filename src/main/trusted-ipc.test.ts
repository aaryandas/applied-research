import { describe, expect, it } from 'vitest';
import { assertTrustedRendererEvent } from './trusted-ipc';

describe('trusted renderer IPC', () => {
  const webContents = { mainFrame: { id: 'main' } };
  const window = { webContents };

  it('accepts the owning window main frame', () => {
    expect(() =>
      assertTrustedRendererEvent(
        { sender: webContents, senderFrame: webContents.mainFrame },
        window,
      ),
    ).not.toThrow();
  });

  it('rejects a guest or detached frame', () => {
    expect(() =>
      assertTrustedRendererEvent(
        { sender: webContents, senderFrame: { id: 'guest' } },
        window,
      ),
    ).toThrow('Untrusted application request.');
    expect(() =>
      assertTrustedRendererEvent(
        {
          sender: { mainFrame: webContents.mainFrame },
          senderFrame: webContents.mainFrame,
        },
        window,
      ),
    ).toThrow('Untrusted application request.');
  });
});

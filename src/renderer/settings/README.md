# Settings consumer

Public entry: `SettingsPanel` and `AccountEntry` from `./settings`.

- Pass a stable `SettingsAccountBridge` with the five reviewed methods. The panel subscribes before its one mount refresh, unsubscribes on unmount and performs additional network refreshes only on explicit retry/refresh. Do not create the bridge object on every parent render.
- The compact `AccountEntry` is controlled by shell account state. It opens Settings without independently refreshing or subscribing.
- Pass controlled `appearance: { value: 'light' | 'dark', onChange }`. The shell applies the palette and updates `value`; its promise resolves after application and rejects on failure. This consumer stores no preference and claims no persistence. System is intentionally absent because the existing shell supports Light/Dark only.
- Import the shell's existing fonts/tokens once. All owned styles are scoped. No shared CSS, theme or composition module is changed here.
- The panel focuses its heading on mount. `onClose` retains the existing workspace and restores focus to the entry that opened Settings. Mount this section in the shell's content region; it is not a modal and imposes no focus trap or authentication gate.
- Cancelling and signing out immediately remove displayed account/usage. The producer owns credential clearing and callback rejection. The renderer blocks stale positive events until another deliberate sign-in/refresh; the public event lacks attempt IDs, so correlation across a newly started attempt remains a producer obligation.
- Provider credentials, remote avatars, purchases and model selection are absent. Sign-in's early waiting reply is not proof of successful OAuth.

Production composition waits for accepted auth producer integration. Synthetic states appear only in colocated tests and the temporary evidence harness. Native keyboard activation, visual captures, full application checks, independent review and integrated Sonar remain coordinator gates.

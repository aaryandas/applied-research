# AR-49 Shell composition patch

Do not apply from the canvas lane. Root owns `src/renderer/Shell.tsx`. Apply
against `codex/ar-walkthrough-integration` after merging this PR.

Also update lane:shell `src/renderer/App.test.tsx`: it currently clicks
“Return to reading”. After this patch, leave Canvas with the existing Reading
sidebar control (`getByRole('button', { name: 'Reading' })`). Distilled and
Expanded remain in the Canvas top bar.

Sidebar expand/collapse is owned by `ReaderSidebar` and needs no Shell state.
Keep `collapsed={isCanvas}` so Canvas still enters collapsed and leaving Canvas
resets to the full outline.

Live authoring stays hidden until both `records` and `onWorkspace` are passed.

```diff
--- a/src/renderer/Shell.tsx
+++ b/src/renderer/Shell.tsx
@@ -362,7 +362,6 @@
                 </button>
               ))}
             </div>
-            <button onClick={() => go('reader')}>Return to reading</button>
           </header>
         )}
         {message && (
@@ -398,6 +397,8 @@
             onMove={moveRecord}
             registerFlush={registerCanvasFlush}
             onShellControls={setCanvasControls}
+            records={bridge}
+            onWorkspace={onWorkspace}
           />
         )}
         {attempt && (
```

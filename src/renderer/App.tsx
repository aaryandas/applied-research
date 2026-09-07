import type { ReactElement } from 'react';
import type { DesktopInfo } from '../contracts/desktop';

export function App({ desktop }: { desktop: DesktopInfo }): ReactElement {
  return (
    <main>
      <p className="eyebrow">Applied Research</p>
      <h1>A learning workbench for builders.</h1>
      <p className="intro">
        Learn enough to try. Bring back what happened. Understand what to do
        next.
      </p>
      <section aria-labelledby="development-heading">
        <h2 id="development-heading">Development foundation</h2>
        <p>
          The desktop shell is running. Learning paths, experiments, and the
          research workspace will be built here.
        </p>
        <p className="runtime">
          Electron {desktop.electronVersion} · {desktop.platform}
        </p>
      </section>
    </main>
  );
}

import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';

export interface CanvasMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface CanvasMenuProps {
  x: number;
  y: number;
  items: readonly CanvasMenuItem[];
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

export function CanvasMenu({
  x,
  y,
  items,
  onSelect,
  onDismiss,
}: Readonly<CanvasMenuProps>): ReactElement {
  const menu = useRef<HTMLDivElement>(null);
  const position = useRef({ left: x, top: y });
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    node.style.left = `${Math.min(Math.max(8, x), maxLeft)}px`;
    node.style.top = `${Math.min(Math.max(8, y), maxTop)}px`;
    position.current = {
      left: Math.min(Math.max(8, x), maxLeft),
      top: Math.min(Math.max(8, y), maxTop),
    };
  }, [x, y, items]);
  useEffect(() => {
    const first = menu.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    const dismissPointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && menu.current?.contains(event.target))
        return;
      onDismiss();
    };
    const dismissKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener('pointerdown', dismissPointer);
    document.addEventListener('keydown', dismissKey);
    return () => {
      document.removeEventListener('pointerdown', dismissPointer);
      document.removeEventListener('keydown', dismissKey);
    };
  }, [onDismiss]);
  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const buttons = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const current = index < 0 ? 0 : index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      buttons[(current + 1) % buttons.length]?.focus();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      buttons[(current - 1 + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
    }
    if (event.key === 'End') {
      event.preventDefault();
      buttons.at(-1)?.focus();
    }
  }
  return (
    <div
      ref={menu}
      className="workspace-canvas-menu"
      role="menu"
      aria-label="Canvas actions"
      style={{ left: x, top: y }}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="workspace-canvas-menu-item"
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) onSelect(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

import {
  Component,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createRoot, extend, useFrame, useThree } from '@react-three/fiber';
import { AmbientLight, DirectionalLight, WebGLRenderer } from 'three';
import type { ExplanationSpec, PartId } from '../../contracts/explanations';
import { createSceneRuntime, type SceneRuntime } from './runtime';

extend({ AmbientLight, DirectionalLight });
interface SceneContentsProps {
  spec: ExplanationSpec;
  reducedMotion: boolean;
  runtimeRef: RefObject<SceneRuntime | null>;
  onSelect: (part: PartId) => void;
  onReady: () => void;
}
interface SceneProps extends SceneContentsProps {
  onLost: () => void;
}
function SceneContents(props: SceneContentsProps): ReactElement {
  const { scene, camera, gl, invalidate } = useThree();
  const callbacks = useRef(props);
  const { recipe } = props.spec;
  const { runtimeRef } = props;
  const firstFrame = useRef(true);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    const instance = createSceneRuntime({
      recipe,
      scene,
      camera,
      canvas: gl.domElement,
      invalidate,
      onSelect: (part) => callbacks.current.onSelect(part),
    });
    runtimeRef.current = instance;
    firstFrame.current = true;
    return () => {
      instance.dispose();
      runtimeRef.current = null;
    };
  }, [recipe, scene, camera, gl, invalidate, runtimeRef]);
  useLayoutEffect(() => {
    runtimeRef.current?.update(props.spec, props.reducedMotion);
  }, [props.spec, props.reducedMotion, runtimeRef]);
  useFrame((_state, delta) => {
    runtimeRef.current?.tick(delta);
    if (firstFrame.current) {
      firstFrame.current = false;
      callbacks.current.onReady();
    }
  });
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 7, 6]} intensity={3} />
      <directionalLight position={[-5, 1, -3]} intensity={1.2} />
    </>
  );
}
class GraphicsBoundary extends Component<
  { children: ReactNode; onLost: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(): void {
    this.props.onLost();
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
/** Own the renderer initialization so async Fiber configuration failures reach the fallback. */
export function SceneCanvas(props: SceneProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSceneRef = useRef<((props: SceneContentsProps) => void) | null>(
    null,
  );
  const callbacks = useRef(props);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const showFailure = (): void => {
      if (!disposed) callbacks.current.onLost();
    };
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      showFailure();
      return;
    }
    const root = createRoot(canvas);
    const lost = (event: Event): void => {
      event.preventDefault();
      showFailure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    const size = (): {
      width: number;
      height: number;
      top: number;
      left: number;
    } => {
      const bounds = canvas.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        top: bounds.top,
        left: bounds.left,
      };
    };
    const renderScene = (contents: SceneContentsProps): void => {
      root.render(
        <GraphicsBoundary onLost={showFailure}>
          <SceneContents
            spec={contents.spec}
            reducedMotion={contents.reducedMotion}
            runtimeRef={contents.runtimeRef}
            onSelect={contents.onSelect}
            onReady={contents.onReady}
          />
        </GraphicsBoundary>,
      );
    };
    const configuration = {
      gl: renderer,
      frameloop: 'demand' as const,
      dpr: Math.min(window.devicePixelRatio, 1.5),
      camera: { fov: 42, near: 0.1, far: 100 },
    };
    let pending = root
      .configure({ ...configuration, size: size() })
      .then(() => {
        if (disposed) return;
        renderSceneRef.current = renderScene;
        renderScene(callbacks.current);
      })
      .catch(showFailure);
    const observer = new ResizeObserver(() => {
      pending = pending
        .then(async () => {
          if (!disposed)
            await root.configure({ ...configuration, size: size() });
        })
        .catch(showFailure);
    });
    observer.observe(canvas);
    return () => {
      disposed = true;
      renderSceneRef.current = null;
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      root.unmount();
      renderer.dispose();
    };
  }, []);
  useLayoutEffect(() => {
    renderSceneRef.current?.(props);
  }, [props]);
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="3D view. Arrow keys orbit, plus and minus zoom, Home resets view."
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}

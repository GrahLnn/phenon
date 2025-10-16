// ZoomPanViewport.tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Vec2 = { x: number; y: number };
type Props = {
  children: React.ReactNode;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  wheelStep?: number;
};

export function ZoomPanViewport({
  children,
  className,
  minZoom = 1,
  maxZoom = 8,
  wheelStep = 1.1,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState<Vec2>({ x: 0, y: 0 });

  // will-change 窗口控制
  const willChangeTimer = useRef<number | null>(null);
  const enableWillChange = () => {
    const el = contentRef.current;
    if (!el) return;
    el.style.willChange = "transform";
    if (willChangeTimer.current)
      cancelIdleCallback(willChangeTimer.current as any);
    // 交互结束后尽快撤销，避免长期位图合成
    willChangeTimer.current = requestIdleCallback(
      () => {
        if (el) el.style.willChange = "";
        willChangeTimer.current = null;
      },
      { timeout: 300 }
    ) as unknown as number;
  };

  // --- 拖拽 ---
  const dragging = useRef(false);
  const dragStart = useRef<Vec2>({ x: 0, y: 0 });
  const originAtDragStart = useRef<Vec2>(origin);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!viewportRef.current) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      originAtDragStart.current = origin;
      enableWillChange();
    },
    [origin]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOrigin(
      snapOrigin({
        x: originAtDragStart.current.x + dx,
        y: originAtDragStart.current.y + dy,
      })
    );
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!(e.target as Element).hasPointerCapture(e.pointerId)) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragging.current = false;
    enableWillChange();
  }, []);

  // --- 非被动 wheel 监听，允许 preventDefault ---
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      enableWillChange();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY > 0 ? 1 / wheelStep : wheelStep;
      // 量化缩放，避免糟糕的小数采样
      const nextZoom = quantize(clamp(zoom * factor, minZoom, maxZoom), 1 / 64);

      const worldX = (mouseX - origin.x) / zoom;
      const worldY = (mouseY - origin.y) / zoom;

      const newOriginX = mouseX - worldX * nextZoom;
      const newOriginY = mouseY - worldY * nextZoom;

      setZoom(nextZoom);
      setOrigin(snapOrigin({ x: newOriginX, y: newOriginY }));
    };

    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => el.removeEventListener("wheel", wheelHandler);
  }, [zoom, origin.x, origin.y, minZoom, maxZoom, wheelStep]);

  // 应用 transform：读取→写入顺序，rAF 批次提交，避免同步合成残留
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // 读一次布局，打断之前的合成缓存
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetTop;

    const t = `translate(${origin.x}px, ${origin.y}px) scale(${zoom})`;
    const raf = requestAnimationFrame(() => {
      // mount 首帧先清空再写入，可强制重建栈
      if (!el.style.transform)
        el.style.transform = "translate(0px,0px) scale(1)";
      el.style.transform = t;
    });
    return () => cancelAnimationFrame(raf);
  }, [origin.x, origin.y, zoom]);

  useEffect(() => {
    return () => {
      if (willChangeTimer.current)
        cancelIdleCallback(willChangeTimer.current as any);
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        overscrollBehavior: "none",
        // 父层不要设置 transform/filter/backdrop-filter/opacity<1，避免整层位图化
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          // willChange 运行时动态开关，不常驻
        }}
      >
        {children}
      </div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const quantize = (v: number, step: number) => Math.round(v / step) * step;
const snap = (v: number) => {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(v * dpr) / dpr;
};
const snapOrigin = (p: Vec2) => ({ x: snap(p.x), y: snap(p.y) });

// ------- 使用示例 -------
export function DemoCanvas() {
  return (
    <ZoomPanViewport className="w-full h-full">
      <div>
        <SelectionCircle />
        <div className="w-7 h-7 border border-black dark:border-white rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        <IconAbs />
      </div>
    </ZoomPanViewport>
  );
}

export function IconAbs() {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        display: "block",
        width: "14px",
        height: "14px",
        strokeWidth: "1.5px",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        stroke: "var(--default-color-node, currentcolor)",
        fill: "transparent",
        boxSizing: "content-box",
        userSelect: "none",
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      <path d="M2 2 L2 22 M22 2 L22 22 M8 8 L16 16 M16 8 L8 16" />
    </svg>
  );
}

export function SelectionCircle() {
  return (
    <svg
      stroke="currentColor"
      strokeWidth={0}
      preserveAspectRatio="xMidYMid meet"
      className="selection"
      style={{
        display: "block",
        width: "35px",
        height: "35px",
        color: "currentColor",
        boxSizing: "border-box",
        cursor: "default",
        position: "absolute",
        fill: "none",
        pointerEvents: "none",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        userSelect: "none",
      }}
    >
      <circle
        cx={17.5}
        cy={17.5}
        r={17}
        style={{
          fill: "none",
          strokeWidth: 1,
          strokeDasharray: 6,
          strokeDashoffset: -6.67588,
        }}
      />
    </svg>
  );
}

/*
React useLayoutEffect
        |
        |  Effect.runFork(Effect.scoped(program))
        v
+------------------------------ Scope --------------------------------+
|                                                                      |
|   program (Effect.gen)                                               |
|     |                                                                |
|     |-- alloc state:                                                  |
|     |     transformRef : SubscriptionRef<Transform>                   |
|     |     draggingRef  : Ref<boolean>                                 |
|     |     dragStartRef : Ref<Vec2>                                    |
|     |     originStartRef: Ref<Vec2>                                   |
|     |     dirtyRef     : Ref<boolean>                                 |
|     |     willChangeFiberRef: Ref<Option<Fiber>>                      |
|     |                                                                |
|     |-- fork #1: commitFiber  (RAF 提交循环)                          |
|     |-- fork #2: inputFiber   (Stream 消费事件循环)                   |
|     |                                                                |
|     |-- addFinalizer: 统一清理（interrupt 上面两个 + will-change fiber）|
|     |                                                                |
|     '-- Effect.never  (常驻直到 React cleanup 中断它)                  |
|                                                                      |
+----------------------------------------------------------------------+
        |
        | React cleanup -> Fiber.interrupt(fiber)
        v
Scope 触发 Finalizer -> 全部资源释放（监听器解绑、fiber 中断、will-change 清空）

[DOM Events]                      [State]                         [DOM Commit]
(pointerdown/move/up/wheel)        (Refs + SubscriptionRef)        (content.style.transform)
        |                               |                               |
        | addEventListener              |                               |
        v                               |                               |
  Stream.async input$                   |                               |
        | emit.single({tag, e})         |                               |
        v                               |                               |
 Stream.runForEach  (inputFiber)        |                               |
        |                               |                               |
        |-- PointerDown:                |                               |
        |    enableWillChange() --------+--> willChangeFiberRef         |
        |    draggingRef = true         |                               |
        |    dragStartRef = clientXY    |                               |
        |    originStartRef = transform.origin (读 transformRef)        |
        |                               |                               |
        |-- PointerMove: if dragging:   |                               |
        |    nextOrigin = originStart + delta                           |
        |    SubscriptionRef.set(transformRef, next) -------------------+
        |    dirtyRef = true -------------------------------------------+----+
        |                                                                   |
        |-- Wheel:                                                        |
        |    enableWillChange()                                            |
        |    nextZoom/nextOrigin 推导                                      |
        |    SubscriptionRef.set(transformRef, next) ----------------------+
        |    dirtyRef = true ----------------------------------------------+----+
                                                                             |
                                                                             v
                                                            commitFiber (RAF loop)
                                                              every frame:
                                                                raf()
                                                                if dirtyRef:
                                                                  t = SubscriptionRef.get(transformRef)
                                                                  content.style.transform = ...
                                                                  onTransformChange?.(t)
                                                                  dirtyRef=false

time →
DOM thread:   down         move move move move         up
               |            |    |    |    |           |
               v            v    v    v    v           v
inputFiber:   [Down]      [Move][Move][Move][Move]   [Up]
              enableWillChange()
              dragging=true
              dragStart=clientXY
              originStart=currentOrigin
                           if dragging:
                             set(transformRef,nextOrigin)
                             dirty=true
                                                   enableWillChange()
                                                   dragging=false

commitFiber:   raf tick      raf tick      raf tick      raf tick ...
               if dirty:     if dirty:     if dirty:
                 read latest   read latest   read latest
                 write DOM     write DOM     write DOM
                 dirty=false   dirty=false   dirty=false

DOM:        wheel wheel wheel wheel wheel ...
             |     |     |     |     |
inputFiber: [W]   [W]   [W]   [W]   [W]
            preventDefault (在 listener 同步阶段)
            enableWillChange (每次重置回收计时)
            set(transformRef,nextZoom+origin)
            dirty=true

commitFiber: raf tick raf tick raf tick ...
             只在每帧写一次 transform（取最新 zoom/origin）

enableWillChange():
  1) 立即：content.style.willChange = "transform"
  2) 若存在旧回收 fiber：interrupt(old)
  3) fork 新 fiber:
       idle(300ms)
       content.style.willChange = ""
  4) willChangeFiberRef = Some(newFiber)

React cleanup
   |
   v
Fiber.interrupt(scopedProgramFiber)
   |
   v
Scope finalizer runs:
  interrupt(inputFiber)      -> 监听器解绑（Stream.async 返回的 Effect cleanup 会执行）
  interrupt(commitFiber)     -> RAF 循环停止，不再写 DOM
  interrupt(willChangeFiber) -> 停止 idle 回收任务
  content.style.willChange="" (兜底清空)
*/
import React, { useCallback, useLayoutEffect, useRef } from "react";
import { Effect, Ref, Fiber, Option, SubscriptionRef } from "effect";
import * as Stream from "effect/Stream";
import { Vec2, MutRef, Transform } from "./graph_utils";
import { action } from "@/src/state_machine/graph";

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function quantize(x: number, step: number) {
  return Math.round(x / step) * step;
}
function snapOrigin(p: Vec2): Vec2 {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
function screenToWorld(s: Vec2, t: Transform): Vec2 {
  return { x: (s.x - t.origin.x) / t.zoom, y: (s.y - t.origin.y) / t.zoom };
}

function worldItemTransform(p: Vec2) {
  return `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
}

function raf(): Effect.Effect<void> {
  return Effect.async<void>((resume) => {
    const id = requestAnimationFrame(() => resume(Effect.void));
    return Effect.sync(() => cancelAnimationFrame(id));
  });
}

function idle(ms = 300): Effect.Effect<void> {
  return Effect.async<void>((resume) => {
    const ric = window.requestIdleCallback as
      | ((cb: () => void, opts?: { timeout?: number }) => number)
      | undefined;
    const cic = window.cancelIdleCallback as ((id: number) => void) | undefined;

    if (!ric) {
      const id = window.setTimeout(() => resume(Effect.void), ms);
      return Effect.sync(() => window.clearTimeout(id));
    }

    const id = ric(() => resume(Effect.void), { timeout: ms });
    return Effect.sync(() => cic?.(id));
  });
}

type PointTag = "PointerDown" | "PointerMove" | "PointerUp";
type InputEvent =
  | { _tag: PointTag; e: PointerEvent }
  | { _tag: "Wheel"; e: WheelEvent };

/**
 * Panel：Effect 驱动的“相机”实现
 * - 真状态在 Effect Ref 中（不会闭包陈旧、不重复绑监听）
 * - 每帧最多写一次 DOM transform（RAF 合并）
 * - will-change 用 Fiber 可中断地延迟回收
 */
export function Panel({
  className,
  style,
  minZoom = 1,
  maxZoom = 8,
  wheelStep = 1.1,
  quantStep = 1 / 64,
  initial = { zoom: 1, origin: { x: 0, y: 0 } },
  transform,
  onTransformChange,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  minZoom?: number;
  maxZoom?: number;
  wheelStep?: number;
  quantStep?: number;
  initial?: Transform;
  transform?: Transform;
  onTransformChange?: (t: Transform) => void;
  children: React.ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const program = Effect.gen(function* () {
      // ---------- Refs: 真状态 ----------
      const seed = transform ?? initial;
      const transformRef = yield* SubscriptionRef.make<Transform>(seed);

      // drag 状态
      const draggingRef = yield* Ref.make(false);
      const dragStartRef = yield* Ref.make<Vec2>({ x: 0, y: 0 });
      const originStartRef = yield* Ref.make<Vec2>(seed.origin);

      // will-change 回收 fiber
      const willChangeFiberRef = yield* Ref.make<
        Option.Option<Fiber.RuntimeFiber<any, any>>
      >(Option.none());

      // RAF 合并：保证每帧最多写一次 transform
      const dirtyRef = yield* Ref.make(true);

      const enableWillChange = Effect.gen(function* () {
        // 立即开
        yield* Effect.sync(() => {
          content.style.willChange = "transform";
        });

        // 中断旧回收
        const old = yield* Ref.get(willChangeFiberRef);
        if (Option.isSome(old)) {
          yield* Fiber.interrupt(old.value);
        }

        // 启新回收：空闲后关
        const fiber = yield* Effect.fork(
          Effect.gen(function* () {
            yield* idle(300);
            yield* Effect.sync(() => {
              content.style.willChange = "";
            });
          })
        );

        yield* Ref.set(willChangeFiberRef, Option.some(fiber));
      });

      const commitLoop = Effect.forever(
        Effect.gen(function* () {
          yield* raf();

          const dirty = yield* Ref.get(dirtyRef);
          if (!dirty) return;

          const t = yield* SubscriptionRef.get(transformRef);

          yield* Effect.sync(() => {
            // 单点写 DOM
            content.style.transform = `translate(${t.origin.x}px, ${t.origin.y}px) scale(${t.zoom})`;
            onTransformChange?.(t);
          });

          yield* Ref.set(dirtyRef, false);
        })
      );

      const commitFiber = yield* Effect.fork(commitLoop);

      const getLocalMouse = (e: { clientX: number; clientY: number }): Vec2 => {
        const r = viewport.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      // ---------- DOM events -> Stream（资源托管 + 单通道输入） ----------
      const input$: Stream.Stream<InputEvent, never, never> = Stream.async(
        (emit) => {
          const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Element;
            if (target.closest("[data-node]")) return;
            viewport.setPointerCapture?.(e.pointerId);
            emit.single({ _tag: "PointerDown", e });
          };

          const onPointerMove = (e: PointerEvent) => {
            emit.single({ _tag: "PointerMove", e });
          };

          const onPointerUp = (e: PointerEvent) => {
            if (!viewport.hasPointerCapture?.(e.pointerId)) return;
            viewport.releasePointerCapture?.(e.pointerId);
            emit.single({ _tag: "PointerUp", e });
          };

          const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            emit.single({ _tag: "Wheel", e });
          };

          viewport.addEventListener("pointerdown", onPointerDown);
          viewport.addEventListener("pointermove", onPointerMove);
          viewport.addEventListener("pointerup", onPointerUp);
          viewport.addEventListener("wheel", onWheel, {
            passive: false,
          });

          return Effect.sync(() => {
            viewport.removeEventListener("pointerdown", onPointerDown);
            viewport.removeEventListener("pointermove", onPointerMove);
            viewport.removeEventListener("pointerup", onPointerUp);
            viewport.removeEventListener("wheel", onWheel, {
              passive: false,
            } as EventListenerOptions);
          });
        }
      );

      const inputFiber = yield* Effect.fork(
        Stream.runForEach(input$, (ev: InputEvent) =>
          Effect.gen(function* () {
            switch (ev._tag) {
              case "PointerDown": {
                yield* enableWillChange;
                yield* Ref.set(draggingRef, true);
                yield* Ref.set(dragStartRef, {
                  x: ev.e.clientX,
                  y: ev.e.clientY,
                });

                const t = yield* SubscriptionRef.get(transformRef);
                yield* Ref.set(originStartRef, t.origin);
                return;
              }
              case "PointerMove": {
                const dragging = yield* Ref.get(draggingRef);
                if (!dragging) return;

                const start = yield* Ref.get(dragStartRef);
                const o0 = yield* Ref.get(originStartRef);

                const dx = ev.e.clientX - start.x;
                const dy = ev.e.clientY - start.y;

                const t = yield* SubscriptionRef.get(transformRef);
                const next: Transform = {
                  ...t,
                  origin: snapOrigin({ x: o0.x + dx, y: o0.y + dy }),
                };

                yield* SubscriptionRef.set(transformRef, next);
                yield* Ref.set(dirtyRef, true);
                return;
              }
              case "PointerUp": {
                yield* enableWillChange;
                yield* Ref.set(draggingRef, false);
                return;
              }
              case "Wheel": {
                yield* enableWillChange;

                const mouse = getLocalMouse(ev.e);
                const t = yield* SubscriptionRef.get(transformRef);

                // 侧向滚轮 / 横向滚动：做平移（不缩放）
                // - 有些鼠标侧滚轮会产生 deltaX
                // - Windows 上 shift + wheel 常用于横向滚动（deltaX 可能为 0，此时用 deltaY）
                if (ev.e.deltaX !== 0 || ev.e.shiftKey) {
                  const dx = ev.e.deltaX !== 0 ? ev.e.deltaX : ev.e.deltaY;
                  const next: Transform = {
                    ...t,
                    origin: snapOrigin({ x: t.origin.x - dx, y: t.origin.y }),
                  };

                  yield* SubscriptionRef.set(transformRef, next);
                  yield* Ref.set(dirtyRef, true);
                  return;
                }

                const world = screenToWorld(mouse, t);

                const factor = ev.e.deltaY > 0 ? 1 / wheelStep : wheelStep;
                const nextZoom = quantize(
                  clamp(t.zoom * factor, minZoom, maxZoom),
                  quantStep
                );

                const nextOrigin = snapOrigin({
                  x: mouse.x - world.x * nextZoom,
                  y: mouse.y - world.y * nextZoom,
                });

                const next: Transform = { zoom: nextZoom, origin: nextOrigin };
                yield* SubscriptionRef.set(transformRef, next);
                yield* Ref.set(dirtyRef, true);
                return;
              }
            }
          })
        )
      );

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Fiber.interrupt(inputFiber);
          yield* Fiber.interrupt(commitFiber);

          const old = yield* Ref.get(willChangeFiberRef);
          if (Option.isSome(old)) {
            yield* Fiber.interrupt(old.value);
          }

          yield* Effect.sync(() => {
            content.style.willChange = "";
          });
        })
      );

      // 初始 flush 一次：把 initial 写进 DOM
      yield* Ref.set(dirtyRef, true);

      // 常驻：直到被 interrupt
      yield* Effect.never;
    });

    const fiber = Effect.runFork(Effect.scoped(program));
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [
    minZoom,
    maxZoom,
    wheelStep,
    quantStep,
    initial,
    transform,
    onTransformChange,
  ]);

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        overscrollBehavior: "none",
        ...style,
      }}
    >
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 世界节点：用绝对定位表达“世界坐标”；可选 data-node 以阻止拖拽穿透 */
interface WorldItemProp {
  ref?: React.Ref<HTMLDivElement>;
  x: number;
  y: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  blockPan?: boolean;
  draggable?: boolean;
  dragMode?: "controlled" | "dom";
  positionRef?: MutRef<Vec2>;
  getZoom?: () => number;
  onPositionChange?: (pos: { x: number; y: number }) => void;
  onDrag?: (pos: { x: number; y: number }) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onElement?: (el: HTMLDivElement) => void;
}
export function WorldItem({
  ref: forwardedRef,
  x,
  y,
  children,
  style,
  className,
  blockPan = true,
  draggable = false,
  dragMode = "controlled",
  positionRef,
  getZoom,
  onPositionChange,
  onDrag,
  onDragStart,
  onDragEnd,
  onElement,
}: WorldItemProp) {
  const itemRef = useRef<HTMLDivElement | null>(null);
  const start_drag = action.start_drag;
  const end_drag = action.end_drag;

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      itemRef.current = node;

      let forwardedCleanup: void | (() => void);
      if (typeof forwardedRef === "function") {
        forwardedCleanup = forwardedRef(node);
      } else if (forwardedRef && "current" in forwardedRef) {
        (forwardedRef as { current: HTMLDivElement | null }).current = node;
      }

      if (!node) return;

      return () => {
        itemRef.current = null;
        if (typeof forwardedRef === "function") {
          if (forwardedCleanup) forwardedCleanup();
          else forwardedRef(null);
        } else if (forwardedRef && "current" in forwardedRef) {
          (forwardedRef as { current: HTMLDivElement | null }).current = null;
        }
      };
    },
    [forwardedRef]
  );

  const posRef = useRef<Vec2>(positionRef?.current ?? { x, y });
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    const seed = positionRef?.current ?? { x, y };
    posRef.current = seed;
    if (positionRef) positionRef.current = seed;
    initializedRef.current = true;
  }

  if (dragMode === "controlled") {
    posRef.current = { x, y };
    if (positionRef) positionRef.current = { x, y };
  }

  const renderPos =
    dragMode === "dom" ? positionRef?.current ?? posRef.current : { x, y };

  useLayoutEffect(() => {
    const el = itemRef.current;
    if (!el || !draggable) return;

    onElement?.(el);

    // dom 模式下：即使父组件因为别的原因重渲染，也把当前位置写回 DOM，避免被 props x/y 覆盖
    if (dragMode === "dom") {
      const p = positionRef?.current ?? posRef.current;
      el.style.transform = worldItemTransform(p);
    }

    if (dragMode === "controlled" && !onPositionChange) return;

    type DragTag = "Down" | "Move" | "Up" | "Cancel";
    type DragEvent = { _tag: DragTag; e: PointerEvent };

    const program = Effect.gen(function* () {
      const draggingRef = yield* Ref.make(false);
      const pointerIdRef = yield* Ref.make<number | null>(null);
      const startClientRef = yield* Ref.make<Vec2>({ x: 0, y: 0 });
      const startPosRef = yield* Ref.make<Vec2>(posRef.current);

      const input$ = Stream.async<DragEvent>((emit) => {
        const onPointerDownDom = (e: PointerEvent) => {
          e.preventDefault();
          e.stopPropagation();
          el.setPointerCapture?.(e.pointerId);
          emit.single({ _tag: "Down", e });
        };

        const onPointerMoveDom = (e: PointerEvent) => {
          emit.single({ _tag: "Move", e });
        };

        const onPointerUpDom = (e: PointerEvent) => {
          emit.single({ _tag: "Up", e });
        };

        const onPointerCancelDom = (e: PointerEvent) => {
          emit.single({ _tag: "Cancel", e });
        };

        el.addEventListener("pointerdown", onPointerDownDom);
        el.addEventListener("pointermove", onPointerMoveDom);
        el.addEventListener("pointerup", onPointerUpDom);
        el.addEventListener("pointercancel", onPointerCancelDom);

        return Effect.sync(() => {
          el.removeEventListener("pointerdown", onPointerDownDom);
          el.removeEventListener("pointermove", onPointerMoveDom);
          el.removeEventListener("pointerup", onPointerUpDom);
          el.removeEventListener("pointercancel", onPointerCancelDom);
        });
      });

      const inputFiber = yield* Effect.fork(
        Stream.runForEach(input$, (ev) =>
          Effect.gen(function* () {
            switch (ev._tag) {
              case "Down": {
                yield* Ref.set(draggingRef, true);
                yield* Ref.set(pointerIdRef, ev.e.pointerId);
                yield* Ref.set(startClientRef, {
                  x: ev.e.clientX,
                  y: ev.e.clientY,
                });
                yield* Ref.set(
                  startPosRef,
                  positionRef?.current ?? posRef.current
                );
                yield* Effect.sync(() => {
                  start_drag();
                  onDragStart?.();
                });
                return;
              }
              case "Move": {
                const dragging = yield* Ref.get(draggingRef);
                if (!dragging) return;

                const pid = yield* Ref.get(pointerIdRef);
                if (pid !== null && ev.e.pointerId !== pid) return;

                ev.e.preventDefault();
                ev.e.stopPropagation();

                const startClient = yield* Ref.get(startClientRef);
                const startPos = yield* Ref.get(startPosRef);
                const z = getZoom?.() ?? 1;

                const dx = (ev.e.clientX - startClient.x) / z;
                const dy = (ev.e.clientY - startClient.y) / z;

                const nextPos = { x: startPos.x + dx, y: startPos.y + dy };

                if (dragMode === "dom") {
                  yield* Effect.sync(() => {
                    posRef.current = nextPos;
                    if (positionRef) positionRef.current = nextPos;
                    el.style.transform = worldItemTransform(nextPos);
                    onDrag?.(nextPos);
                  });
                  return;
                }

                yield* Effect.sync(() => {
                  onPositionChange?.(nextPos);
                });
                return;
              }
              case "Up":
              case "Cancel": {
                const pid = yield* Ref.get(pointerIdRef);
                if (pid !== null && ev.e.pointerId !== pid) return;

                yield* Ref.set(draggingRef, false);
                yield* Ref.set(pointerIdRef, null);
                yield* Effect.sync(() => {
                  if (el.hasPointerCapture?.(ev.e.pointerId)) {
                    el.releasePointerCapture?.(ev.e.pointerId);
                  }
                  end_drag();
                  onDragEnd?.();
                });
                return;
              }
            }
          })
        )
      );

      yield* Effect.addFinalizer(() => Fiber.interrupt(inputFiber));
      yield* Effect.never;
    });

    const fiber = Effect.runFork(Effect.scoped(program));
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [draggable, onPositionChange]);

  return (
    <div
      {...(blockPan ? { "data-node": "" } : {})}
      ref={mergedRef}
      className={className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: worldItemTransform(renderPos),
        touchAction: draggable ? "none" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

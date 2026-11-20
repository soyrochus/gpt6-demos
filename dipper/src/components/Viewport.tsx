import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createSky,
  loadOverlays,
  type DrawState,
  type ObjectId,
} from "../renderer/scene";
import type { Catalogue } from "../catalog/catalog";
import { clamp, wrap, type View } from "../astro/sky";
export const north: View = {
  azimuthDeg: 0,
  altitudeDeg: 35,
  verticalFovDeg: 75,
};
export function Viewport({
  catalog,
  state,
  move,
  select,
  toggle,
  onNotice,
}: {
  catalog: Catalogue;
  state: DrawState;
  move: Dispatch<SetStateAction<View>>;
  select: (id: ObjectId | null) => void;
  toggle: () => void;
  onNotice: (s: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLDivElement>(null),
    engine = useRef<ReturnType<typeof createSky> | null>(null);
  const current = useRef(state);
  current.current = state;
  const [error, setError] = useState(""),
    [generation, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(),
      c = canvas.current!;
    function lost(e: Event) {
      e.preventDefault();
      setError("WebGL context lost. Waiting for graphics recovery.");
    }
    function restored() {
      retry((v) => v + 1);
    }
    c.addEventListener("webglcontextlost", lost);
    c.addEventListener("webglcontextrestored", restored);
    loadOverlays(abort.signal).then((a) => {
      if (abort.signal.aborted) return;
      if (!a.figures.length || !a.density)
        onNotice(
          [
            !a.figures.length ? "Constellation data unavailable." : "",
            !a.density ? "Milky Way density unavailable." : "",
          ]
            .join(" ")
            .trim(),
        );
      try {
        const e = createSky(c, overlay.current!, catalog, a, onNotice);
        engine.current = e;
        e.draw(current.current);
        e.pick(-1, -1, true);
        setError("");
      } catch {
        setError(
          "The sky requires WebGL 2. Enable hardware acceleration or try a WebGL 2 browser.",
        );
      }
    });
    function wheel(e: WheelEvent) {
      e.preventDefault();
      move((v) => ({
        ...v,
        verticalFovDeg: clamp(
          v.verticalFovDeg *
            Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.018 : 0.0015)),
          10,
          100,
        ),
      }));
    }
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      abort.abort();
      engine.current?.dispose();
      engine.current = null;
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("webglcontextrestored", restored);
    };
  }, [catalog, generation]);
  useEffect(() => {
    engine.current?.draw(state);
  }, [state]);
  const pointers = useRef(new Map<number, [number, number]>()),
    travel = useRef(0);
  const pitch = (h: number) => clamp(h, state.layers.free ? -90 : -10, 90);
  return (
    <>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="Interactive night sky. Drag to look, scroll to zoom, arrow keys to turn."
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (!pointers.current.size) travel.current = 0;
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pointers.current.size > 1) travel.current = 10;
        }}
        onPointerMove={(e) => {
          const old = pointers.current.get(e.pointerId);
          if (!old) return;
          const dx = e.clientX - old[0],
            dy = e.clientY - old[1];
          const other = [...pointers.current].find(
            ([k]) => k !== e.pointerId,
          )?.[1];
          const scale =
            state.view.verticalFovDeg /
            Math.max(1, e.currentTarget.clientHeight);
          if (other) {
            const before = Math.hypot(old[0] - other[0], old[1] - other[1]),
              after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
            if (after > 2)
              move((v) => ({
                ...v,
                verticalFovDeg: clamp(
                  (v.verticalFovDeg * before) / after,
                  10,
                  100,
                ),
              }));
          } else
            move((v) => ({
              ...v,
              azimuthDeg: wrap(v.azimuthDeg - dx * scale),
              altitudeDeg: pitch(v.altitudeDeg + dy * scale),
            }));
          travel.current += Math.abs(dx) + Math.abs(dy);
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
        }}
        onPointerUp={(e) => {
          if (pointers.current.has(e.pointerId) && travel.current < 4) {
            const r = e.currentTarget.getBoundingClientRect();
            select(
              engine.current?.pick(e.clientX - r.left, e.clientY - r.top) ??
                null,
            );
          }
          pointers.current.delete(e.pointerId);
        }}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onKeyDown={(e) => {
          const key = e.key.toLowerCase();
          if (
            ![
              "arrowleft",
              "arrowright",
              "arrowup",
              "arrowdown",
              "n",
              " ",
              "+",
              "=",
              "-",
            ].includes(key)
          )
            return;
          e.preventDefault();
          if (key === " ") toggle();
          else
            move((v) => ({
              ...v,
              azimuthDeg:
                key === "n"
                  ? 0
                  : wrap(
                      v.azimuthDeg +
                        (key === "arrowright"
                          ? 5
                          : key === "arrowleft"
                            ? -5
                            : 0),
                    ),
              altitudeDeg:
                key === "n"
                  ? 35
                  : pitch(
                      v.altitudeDeg +
                        (key === "arrowup" ? 5 : key === "arrowdown" ? -5 : 0),
                    ),
              verticalFovDeg: clamp(
                v.verticalFovDeg +
                  (key === "-" ? 5 : key === "+" || key === "=" ? -5 : 0),
                10,
                100,
              ),
            }));
        }}
      />
      <div ref={overlay} className="sky-labels" aria-hidden="true" />
      {error && (
        <div className="sky-error" role="alert">
          {error}
          <button onClick={() => retry((n) => n + 1)}>Retry graphics</button>
        </div>
      )}
    </>
  );
}

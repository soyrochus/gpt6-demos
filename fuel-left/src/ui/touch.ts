import { Inputs, type Action } from "../input/keys";
export function installTouch(
  canvas: HTMLCanvasElement,
  inputs: Inputs,
  wake: () => void,
) {
  function bind(el: HTMLElement, action: (e: PointerEvent) => Action) {
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      wake();
      el.setPointerCapture(e.pointerId);
      inputs.hold("p" + e.pointerId, action(e));
      el.classList.add("pressed");
    });
    const release = (e: PointerEvent) => {
      inputs.release("p" + e.pointerId);
      el.classList.remove("pressed");
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("lostpointercapture", release);
    el.addEventListener("pointercancel", release);
  }
  bind(canvas, (e) => {
    const r = canvas.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? "left" : "right";
  });
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    const a = el.dataset.action as Action;
    bind(el, () => a);
    el.addEventListener("keydown", (e) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.stopPropagation();
      e.preventDefault();
      wake();
      inputs.hold("button" + e.code, a);
    });
    el.addEventListener("keyup", (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        inputs.release("button" + e.code);
      }
    });
    // Assistive technology may activate a button by clicking without pointer events.
    el.addEventListener("click", (e) => {
      if (e.detail === 0) {
        wake();
        inputs.hold("activate", a);
        inputs.release("activate");
      }
    });
  });
}

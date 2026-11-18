import { RULES as R } from "../rules/constants";
export const defaults = {
  left: "KeyZ",
  right: "Slash",
  plunger: "Space",
  nudgeLeft: "KeyX",
  nudgeRight: "Period",
  nudgeUp: "ArrowUp",
  newGame: "F2",
  pause: "F3",
  controls: "F8",
};
export type Action = keyof typeof defaults;
export const names: Record<Action, string> = {
  left: "Left flipper",
  right: "Right flipper",
  plunger: "Plunger",
  nudgeLeft: "Nudge left",
  nudgeRight: "Nudge right",
  nudgeUp: "Nudge up",
  newGame: "New game",
  pause: "Pause",
  controls: "Controls",
};
export function loadKeys() {
  const result = { ...defaults };
  try {
    const v = JSON.parse(localStorage.getItem(R.keyKey) ?? "{}");
    for (const a of Object.keys(defaults) as Action[])
      if (typeof v?.[a] === "string") result[a] = v[a];
  } catch {}
  return result;
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing can disable persistence. */
  }
}
export function keyName(code: string) {
  return (
    (
      {
        Slash: "/",
        Period: ".",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ArrowLeft: "←",
        ArrowRight: "→",
        Space: "Space",
      } as Record<string, string>
    )[code] ?? code.replace(/^Key|^Digit/, "")
  );
}
export class Inputs {
  keys = loadKeys();
  private pressed = new Map<string, Action>();
  constructor(readonly change: (a: Action, down: boolean) => void) {}
  key(code: string) {
    if (code === "ShiftLeft") return "left";
    if (code === "ShiftRight") return "right";
    if (code === "Escape") return "pause";
    return (Object.keys(this.keys) as Action[]).find(
      (a) => this.keys[a] === code,
    );
  }
  hold(id: string, action: Action) {
    if (this.pressed.has(id)) return;
    const already = [...this.pressed.values()].includes(action);
    this.pressed.set(id, action);
    if (!already) this.change(action, true);
  }
  release(id: string) {
    const a = this.pressed.get(id);
    if (!a) return;
    this.pressed.delete(id);
    if (![...this.pressed.values()].includes(a)) this.change(a, false);
  }
  clear() {
    this.pressed.clear();
  }
  remap(a: Action, code: string) {
    if (
      [
        "Escape",
        "ShiftLeft",
        "ShiftRight",
        "Tab",
        "MetaLeft",
        "MetaRight",
      ].includes(code)
    )
      return false;
    const other = this.key(code);
    if (other && other !== a) this.keys[other] = this.keys[a];
    this.keys[a] = code;
    store(R.keyKey, this.keys);
    return true;
  }
}

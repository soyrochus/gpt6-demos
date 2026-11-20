// SPDX-License-Identifier: GPL-2.0-or-later
// Passive browser-side counters. Weak references allow normal GPU collection.
export function observeResources() {
  const objects = new Map();
  const activeLoops = new Set();
  let hostListeners = 0;
  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (...args) {
    if (new Error().stack.includes("/host.js:")) hostListeners++;
    return original.apply(this, args);
  };
  for (const method of [
    "createTexture",
    "createBuffer",
    "createRenderPipeline",
    "createBindGroup",
  ]) {
    const get = GPUDevice.prototype[method];
    objects.set(method, []);
    GPUDevice.prototype[method] = function (...args) {
      const result = get.apply(this, args);
      objects.get(method).push(new WeakRef(result));
      return result;
    };
  }
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (this.loop) {
      activeLoops.add(this);
      this.addEventListener("ended", () => activeLoops.delete(this), {
        once: true,
      });
    }
    return start.apply(this, args);
  };
  window.observedResources = () => ({
    hostListeners,
    ambientLoops: activeLoops.size,
    gpu: Object.fromEntries(
      [...objects].map(([k, list]) => [
        k,
        list.filter((w) => w.deref()).length,
      ]),
    ),
  });
}

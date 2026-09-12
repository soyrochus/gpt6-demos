import type { CrosstalkApplicationEvent } from '../../cross-talk/src/protocol';
import { CrosstalkError } from '../../cross-talk/src/protocol';
import { perspectives, type EuropaState, type ViewMode, type LightMode } from './manifest';
import type { SpatialState, SpatialDestination } from '../spatial';
export interface EuropaExplorer {
  setPerspective(view: ViewMode, signal?: AbortSignal): Promise<void>;
  setLighting(mode: LightMode): void;
  setAutoRotate(value: boolean): void;
  adjustZoom(factor: number): void;
  capture(context?: { id: string; signal?: AbortSignal }): unknown;
  getZoomLevel(): EuropaState['zoomLevel'];
  getSpatialState?(): SpatialState;
  showSide?(side: SpatialDestination, signal?: AbortSignal): Promise<void>;
  orbitView?(direction: 'left' | 'right', degrees: number, signal?: AbortSignal): Promise<void>;
  onNavigationChange?(listener: (kind: 'manual' | 'zoom' | 'spatial') => void): () => void;
}
export interface EuropaDisplay {
  isFullscreen(): boolean;
  setFullscreen(enabled: boolean): Promise<void>;
  onFullscreenChange(listener: () => void): () => void;
}
/** Shared by the human controls and the Crosstalk adapter. */
export class EuropaController {
  private ready = false;
  private perspective: ViewMode = 'urban';
  private lighting: LightMode = 'day';
  private autoRotate = false;
  private adjusted = false;
  private transitioning = false;
  private revision = 0;
  private listeners = new Set<(event: CrosstalkApplicationEvent) => void>();
  constructor(private explorer: EuropaExplorer, private render: (state: EuropaState) => void = () => {}, private display?: EuropaDisplay) {
    explorer.onNavigationChange?.(kind => { if (kind === 'manual') this.adjusted = true; this.changed('navigation.changed'); });
    display?.onFullscreenChange(() => this.changed('fullscreen.changed'));
  }
  getState = (): EuropaState => ({ ready: this.ready, perspective: this.perspective, lighting: this.lighting, autoRotate: this.autoRotate, fullscreen: this.display?.isFullscreen() ?? false,
    zoomLevel: this.explorer.getZoomLevel(), visibleFeatures: this.adjusted || this.transitioning || this.autoRotate ? [] : [...perspectives[this.perspective].visibleFeatures], viewAdjusted: this.adjusted, transitioning: this.transitioning, spatial: this.explorer.getSpatialState?.() ?? null });
  subscribe = (listener: (event: CrosstalkApplicationEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed(type: string) { this.render(this.getState()); const event = { type, timestamp: Date.now() }; this.listeners.forEach(listener => listener(event)); }
  setReady(ready: boolean) { this.ready = ready; this.changed('readiness.changed'); }
  async setPerspective(view: ViewMode, signal?: AbortSignal) {
    signal?.throwIfAborted();this.perspective = view;
    return this.navigate(() => this.explorer.setPerspective(view, signal), false);
  }
  private async navigate(action: () => Promise<void>, adjusted: boolean) {
    const revision = ++this.revision;
    this.explorer.setAutoRotate(false);this.autoRotate = false;
    this.adjusted = adjusted; this.transitioning = true; this.changed('perspective.changed');
    try { await action(); }
    catch (error) { if (this.revision === revision) this.adjusted = true; throw error; }
    finally { if (this.revision === revision) { this.transitioning = false; this.changed('perspective.settled'); } }
  }
  showSide(side: SpatialDestination, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!this.explorer.showSide) throw new CrosstalkError('SPATIAL_UNAVAILABLE', 'Spatial navigation is unavailable.', false);
    return this.navigate(() => this.explorer.showSide!(side, signal), true);
  }
  orbitView(direction: 'left' | 'right', degrees = 30, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!this.explorer.orbitView) throw new CrosstalkError('SPATIAL_UNAVAILABLE', 'Spatial navigation is unavailable.', false);
    return this.navigate(() => this.explorer.orbitView!(direction, degrees, signal), true);
  }
  setLighting(mode: LightMode) { this.explorer.setLighting(mode); this.lighting = mode; this.changed('lighting.changed'); }
  setAutoRotate(enabled: boolean) { this.explorer.setAutoRotate(enabled); if (this.autoRotate && !enabled) this.adjusted = true; this.autoRotate = enabled; this.changed('rotation.changed'); }
  adjustZoom(direction: 'closer' | 'farther', amount: 'small' | 'medium' | 'large' = 'medium') {
    const factors = { closer: { small: .90, medium: .82, large: .68 }, farther: { small: 1.10, medium: 1.22, large: 1.45 } };
    this.explorer.adjustZoom(factors[direction][amount]); this.changed('zoom.changed');
  }
  resetPerspective(signal?: AbortSignal) { return this.setPerspective(this.perspective, signal); }
  async setFullscreen(enabled: boolean) {
    if (this.getState().fullscreen === enabled) return;
    if (!this.display) throw new CrosstalkError('FULLSCREEN_UNAVAILABLE', 'Fullscreen is unavailable in this environment.', false);
    await this.display.setFullscreen(enabled);
    this.changed('fullscreen.changed');
  }
  async capture(id: string = crypto.randomUUID(), signal?: AbortSignal) { signal?.throwIfAborted(); return await this.explorer.capture({ id, signal }) ?? { width: 3840, height: 2160, format: 'png', downloaded: true }; }
}

export interface NativeWindow {
  loadUrl(url: string): void;
  onClose(fn: () => void): void;
  onPageLoad(fn: (event: string, url: string) => void): void;
  evaluateJs(script: string): void;
  onMessage(fn: (message: string, source: string) => void): void;
  close(): void;
  setFullscreen(enabled: boolean): void;
  isFullscreen(): boolean;
  chooseSaveFile(name: string, callback: (path: string) => void): void;
  cancelSaveFile(): void;
}
export interface NativeBinding { NativeWindow: new(options: Record<string, unknown>) => NativeWindow }

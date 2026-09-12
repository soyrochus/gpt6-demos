declare module 'europa:assets' { const assets: Record<string, { body: string; type: string }>; export default assets }
declare module 'europa:native' { const binding: () => import('./native').NativeBinding; export default binding }

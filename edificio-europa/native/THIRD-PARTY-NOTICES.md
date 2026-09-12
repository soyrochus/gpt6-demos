# Europa desktop third-party software

The executable contains Bun (MIT), Three.js (MIT), OpenAI JavaScript SDK (Apache-2.0), Ajv (MIT), and the nativewindow/webview binding (MIT). The native binding is pinned to commit acfbe3ce4be2b70dc664bdd6c5feb53c52f9ce3e (1.0.6); its MIT license follows in LICENSE. The local patch derives the Wayland container fix from Crumb and adds Europa's media policy and window operations. No Crumb source checkout is required to build or run.

Native dependencies include Tao (Apache-2.0 OR MIT), Wry (Apache-2.0 OR MIT), napi-rs (MIT), gtk-rs (MIT), and their Cargo.lock dependencies. Linux GTK, WebKitGTK and GStreamer are dynamically linked OS components, distributed by the operating system. Build dependencies are pinned by the native Cargo.lock and the project Bun lockfiles.

Desktop typefaces are system fallbacks. No Google Fonts or reference photographs are distributed.

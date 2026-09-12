import { DesktopTransport } from '../desktop/DesktopTransport';
import type { ClientMessage, CrosstalkApplication, ServerMessage, Status } from '../protocol';
import { ApplicationBridge } from './ApplicationBridge';
import { ToolExecutor } from './ToolExecutor';
import { LiveTransport } from './LiveTransport';
import { CrosstalkPanel } from './ui/CrosstalkPanel';
export class CrosstalkClient {
  readonly instanceId = crypto.randomUUID();
  private socket?: WebSocket;
  private bridge?: ApplicationBridge;
  private executor?: ToolExecutor;
  private panel?: CrosstalkPanel;
  private live?: LiveTransport | DesktopTransport;
  private sessionId?: string;
  private capabilities: string[] = [];
  private ending?: Promise<void>;
  private token?: string;
  private disposed = false;
  private connected = false;
  private speakingTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private status: Status = 'idle';
  private message?: string;
  private endpoint: URL;
  constructor(private options: { endpoint: string; desktopWorklet?: string }) { this.endpoint = new URL(options.endpoint.replace(/\/$/, '') + '/', location.href); }
  private send = (message: ClientMessage) => { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); };
  async register(application: CrosstalkApplication) {
    if (this.bridge) throw new Error('An application is already registered.');
    this.bridge = new ApplicationBridge(application, message => { if (this.connected) this.send(message); });
    await this.bridge.registration();
    this.bridge.subscribe();
    await this.connect();
  }
  private async connect(): Promise<void> {
    const url = new URL('ws', this.endpoint); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.socket = new WebSocket(url);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Crosstalk registration timed out.')); socket.close(); }, 10_000);
      socket.onopen = () => this.send({ type: 'client.hello', protocolVersion: '1.0', instanceId: this.instanceId, application: { id: this.bridge!.application.manifest.application.id, version: this.bridge!.application.manifest.application.version } });
      socket.onmessage = async ({ data }) => {
        if (socket !== this.socket) return;
        try {
          const message = JSON.parse(data) as ServerMessage;
          if (message.type === 'server.hello') {
            this.token = message.token; this.sessionId = message.sessionId; this.capabilities = message.capabilities ?? []; this.executor?.dispose(); this.executor = new ToolExecutor(this.bridge!.application, message.sessionId);
            this.send({ type: 'application.register', ...await this.bridge!.registration() });
          } else if (message.type === 'application.registered') { clearTimeout(timer); this.connected = true; resolve(); }
          else await this.receive(message);
        } catch { this.setStatus('error', 'The application connection could not process a request.'); }
      };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Crosstalk server is unavailable.')); };
      socket.onclose = () => {
        clearTimeout(timer); reject(new Error('Crosstalk disconnected.'));
        if (socket !== this.socket) return;
        this.connected = false; this.token = undefined; this.executor?.dispose(); this.panel?.cancelConfirmation();
        if (this.live) { this.live.dispose(); this.live = undefined; ++this.generation; this.setStatus('error', 'Application disconnected. Reconnecting…'); }
        if (!this.disposed) this.reconnectTimer = setTimeout(() => { void this.connect().catch(() => {}); }, 1500);
      };
    });
  }
  private async receive(message: ServerMessage) {
    switch (message.type) {
      case 'state.request':
        try { this.send({ type: 'state.result', requestId: message.requestId, state: await this.bridge!.state() }); }
        catch { this.send({ type: 'state.error', requestId: message.requestId }); } break;
      case 'tool.invoke': this.send({ type: 'tool.result', invocationId: message.invocationId, result: await this.executor!.execute(message) }); break;
      case 'tool.cancel': this.executor?.cancel(message.invocationId); break;
      case 'delegation.cancel': this.executor?.cancelDelegation(message.delegationId); this.panel?.cancelConfirmation(); break;
      case 'confirmation.request': {
        const executor = this.executor;
        const tool = this.bridge!.application.tools.find(t => t.definition.name === message.tool);
        const approved = tool ? await this.panel?.confirm(message.requestId, tool.definition.title, message.arguments) ?? false : false;
        if (approved) executor?.approve(message.requestId, message.tool, message.arguments);
        if (executor === this.executor) this.send({ type: 'confirmation.result', requestId: message.requestId, approved }); break;
      }
      case 'confirmation.cancel': this.panel?.cancelConfirmation(message.requestId); break;
      case 'session.status':
        if (message.status === 'idle' || message.status === 'error') { this.live?.dispose(); this.live = undefined; ++this.generation; }
        this.setStatus(message.status, message.message); break;
      case 'transcript':
        this.panel?.transcript(message.role, message.text);
        if (this.live && ['listening', 'speaking'].includes(this.status)) {
          clearTimeout(this.speakingTimer); this.setStatus(message.role === 'assistant' ? 'speaking' : 'listening');
          if (message.role === 'assistant') this.speakingTimer = setTimeout(() => { if (this.status === 'speaking') this.setStatus('listening'); }, 1800);
        }
        break;
      case 'error': this.setStatus('error', message.message); break;
    }
  }
  mountButton(options: { position?: 'bottom-right' | 'bottom-left' } = {}) {
    this.panel?.dispose(); this.panel = new CrosstalkPanel(() => { if (this.live) void this.end(); else void this.start(); }, options.position);
    this.panel.setStatus(this.status, this.message);
  }
  private setStatus(status: Status, message?: string) { this.status = status; this.message = message; this.panel?.setStatus(status, message); }
  async start() {
    if (this.ending) await this.ending;
    if (this.live || this.disposed) return;
    if (!this.connected || !this.token) { this.setStatus('error', 'Connecting to the application. Please try again shortly.'); return; }
    if (!this.panel) this.mountButton();
    const generation = ++this.generation;
    this.setStatus('connecting');
    const onState = (state: Status, message?: string) => {
      if (generation !== this.generation) return;
      this.setStatus(state, message);
      if (state === 'idle' || state === 'error') { live.dispose(); this.live = undefined; this.send({ type: 'session.end' }); }
    };
    if (this.options.desktopWorklet && !this.capabilities.includes('desktop-audio/1')) { this.setStatus('error', 'Desktop voice transport is unavailable.'); return; }
    const live = this.live = this.options.desktopWorklet
      ? new DesktopTransport({ endpoint: this.endpoint, instanceId: this.instanceId, sessionId: this.sessionId!, token: this.token, worklet: this.options.desktopWorklet }, onState)
      : new LiveTransport(this.panel!.audio, onState);
    try {
      if (live instanceof DesktopTransport) await live.start();
      else await live.start(async (sdp, signal) => {
        const response = await fetch(new URL('live/session', this.endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ applicationInstanceId: this.instanceId, sdp }), signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Voice is unavailable.'); return result.sdp;
      });
    } catch (error) {
      live.dispose();
      if (generation === this.generation) { this.live = undefined; this.send({ type: 'session.end' }); this.setStatus('error', error instanceof Error ? error.message : 'Voice is unavailable.'); }
    }
  }
  async end() {
    ++this.generation; const live = this.live; this.live = undefined;
    this.panel?.cancelConfirmation(); this.send({ type: 'session.end' }); this.setStatus('idle');
    this.ending = live?.stop();
    await this.ending; this.ending = undefined;
  }
  dispose() { this.disposed = true; ++this.generation; clearTimeout(this.reconnectTimer); clearTimeout(this.speakingTimer); this.send({ type: 'session.end' }); this.live?.dispose(); this.executor?.dispose(); this.bridge?.dispose(); this.socket?.close(); this.panel?.dispose(); }
}

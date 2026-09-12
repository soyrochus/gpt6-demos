export type JsonSchema = Record<string, unknown>;
export interface CrosstalkApplicationManifest {
  schemaVersion: '1.0';
  application: { id: string; name: string; version: string; summary: string; purpose: string };
  domain: {
    concepts: { id: string; name: string; description: string }[];
    knowledge: { id: string; title: string; text: string; tags?: string[] }[];
    limitations: string[];
  };
  interaction: { conversationalGuidance?: string[]; recommendedGoals?: { id: string; description: string }[] };
  stateSchema: JsonSchema;
}
export interface CrosstalkToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  effect: 'read' | 'navigation' | 'mutation' | 'external';
  confirmation: 'never' | 'always' | 'when-not-explicit';
  interruptible: boolean;
  expectedDurationMs?: number;
}
export type CrosstalkToolResult<T = unknown> =
  | { ok: true; data: T; stateChanged?: boolean }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
export interface CrosstalkToolContext {
  invocationId: string;
  sessionId: string;
  delegationId: string;
  signal: AbortSignal;
  explicitUserRequest: boolean;
}
export interface CrosstalkTool<TInput = any, TOutput = unknown> {
  definition: CrosstalkToolDefinition;
  execute(input: TInput, context: CrosstalkToolContext): TOutput | Promise<TOutput>;
}
export interface CrosstalkApplicationEvent { type: string; timestamp: number; data?: unknown }
export interface CrosstalkApplication<TState extends object = object> {
  manifest: CrosstalkApplicationManifest;
  getState(): TState | Promise<TState>;
  tools: CrosstalkTool[];
  subscribe?(listener: (event: CrosstalkApplicationEvent) => void): () => void;
}
export type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'working' | 'waiting-for-confirmation' | 'error';
export interface Registration { manifest: CrosstalkApplicationManifest; tools: CrosstalkToolDefinition[]; state: unknown }
export interface ToolInvocation {
  type: 'tool.invoke'; invocationId: string; sessionId: string; delegationId: string;
  tool: string; arguments: unknown; explicitUserRequest: boolean; confirmed: boolean; expiresAt: number;
}
export type ClientMessage =
  | { type: 'client.hello'; protocolVersion: '1.0'; instanceId: string; application: { id: string; version: string } }
  | ({ type: 'application.register' } & Registration)
  | { type: 'state.result'; requestId: string; state: unknown }
  | { type: 'state.error'; requestId: string }
  | { type: 'application.event'; event: CrosstalkApplicationEvent; state: unknown }
  | { type: 'tool.result'; invocationId: string; result: CrosstalkToolResult }
  | { type: 'confirmation.result'; requestId: string; approved: boolean }
  | { type: 'session.end' };
export type ServerMessage =
  | { type: 'server.hello'; protocolVersion: '1.0'; sessionId: string; token: string; status: 'ready'; capabilities?: string[] }
  | { type: 'application.registered' }
  | { type: 'state.request'; requestId: string }
  | ToolInvocation
  | { type: 'tool.cancel'; invocationId: string }
  | { type: 'delegation.cancel'; delegationId: string }
  | { type: 'confirmation.request'; requestId: string; delegationId: string; tool: string; title: string; arguments: unknown }
  | { type: 'confirmation.cancel'; requestId: string }
  | { type: 'session.status'; status: Status; message?: string }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string }
  | { type: 'error'; code: string; message: string };
export const failure = (code: string, message: string, retryable = false): CrosstalkToolResult => ({ ok: false, error: { code, message, retryable } });
export class CrosstalkError extends Error {
  constructor(public code: string, message: string, public retryable = false) { super(message); }
}
export function errorResult(error: unknown): CrosstalkToolResult {
  if (error instanceof CrosstalkError) return failure(error.code, error.message, error.retryable);
  if (error instanceof Error && error.name === 'AbortError') return failure('CANCELLED', 'The action was cancelled.');
  return failure('TOOL_FAILED', 'The application could not complete the action.', true);
}
export function needsConfirmation(tool: CrosstalkToolDefinition, explicit: boolean) {
  return tool.confirmation === 'always' || (tool.confirmation === 'when-not-explicit' && !explicit);
}
export function toolTimeout(tool: CrosstalkToolDefinition) { return tool.effect === 'external' ? 30_000 : tool.effect === 'navigation' ? 5_000 : 10_000; }

import Ajv from 'ajv';
import type { JsonSchema, Registration, CrosstalkToolDefinition } from './index';
import { CrosstalkError } from './index';
const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false, ownProperties: true });
export const objectSchema = (properties: Record<string, unknown>, required = Object.keys(properties)): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string', minLength: 1, maxLength: 8000 };
const strings = { type: 'array', maxItems: 100, items: string };
const schema = { type: 'object' };
const manifestSchema = objectSchema({
  schemaVersion: { const: '1.0' },
  application: objectSchema({ id: string, name: string, version: string, summary: string, purpose: string }),
  domain: objectSchema({
    concepts: { type: 'array', maxItems: 100, items: objectSchema({ id: string, name: string, description: string }) },
    knowledge: { type: 'array', maxItems: 100, items: objectSchema({ id: string, title: string, text: string, tags: strings }, ['id', 'title', 'text']) },
    limitations: strings,
  }),
  interaction: objectSchema({ conversationalGuidance: strings, recommendedGoals: { type: 'array', maxItems: 100, items: objectSchema({ id: string, description: string }) } }, []),
  stateSchema: schema,
});
const definitionSchema = objectSchema({ name: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' }, title: string, description: string,
  inputSchema: schema, outputSchema: schema,
  effect: { enum: ['read', 'navigation', 'mutation', 'external'] }, confirmation: { enum: ['never', 'always', 'when-not-explicit'] },
  interruptible: { type: 'boolean' }, expectedDurationMs: { type: 'number', minimum: 0, maximum: 30000 },
}, ['name', 'title', 'description', 'inputSchema', 'effect', 'confirmation', 'interruptible']);
export const registrationSchema = objectSchema({ manifest: manifestSchema, tools: { type: 'array', maxItems: 64, items: definitionSchema }, state: {} });
const registrationCheck = ajv.compile(registrationSchema);
// Only local, self-contained schemas: no network refs or executable custom keywords.
function checkSchema(schema: JsonSchema, input = false) {
  if (JSON.stringify(schema).includes('"$async"')) throw new CrosstalkError('INVALID_SCHEMA', 'Async schemas are not supported.');
  if (JSON.stringify(schema).length > 32000) throw new CrosstalkError('INVALID_SCHEMA', 'Schema is too large.');
  if (input && (schema.type !== 'object' || schema.additionalProperties !== false)) throw new CrosstalkError('INVALID_SCHEMA', 'Tool inputs must be strict objects.');
  try { ajv.compile(schema); } catch { throw new CrosstalkError('INVALID_SCHEMA', 'Invalid JSON Schema.'); }
}
export function validate(schema: JsonSchema, value: unknown): void {
  const check = ajv.compile(schema);
  if (!check(value)) throw new CrosstalkError('INVALID_ARGUMENTS', ajv.errorsText(check.errors));
}
export function validateRegistration(value: unknown): asserts value is Registration {
  if (!registrationCheck(value)) throw new CrosstalkError('INVALID_REGISTRATION', 'Invalid application manifest or tool definitions.');
  const registration = value as Registration;
  checkSchema(registration.manifest.stateSchema);
  const names = new Set<string>();
  for (const tool of registration.tools) {
    if (names.has(tool.name)) throw new CrosstalkError('INVALID_REGISTRATION', 'Duplicate tool name.');
    names.add(tool.name); checkSchema(tool.inputSchema, true);
    if (tool.outputSchema) checkSchema(tool.outputSchema);
  }
  validate(registration.manifest.stateSchema, registration.state);
}
export const resultSchema = objectSchema({ ok: { type: 'boolean' }, data: {}, stateChanged: { type: 'boolean' }, error: objectSchema({ code: string, message: string, retryable: { type: 'boolean' } }) }, ['ok']);
export function validateResult(value: unknown) {
  validate(resultSchema, value);
  const r = value as Record<string, unknown>;
  if (r.ok ? !Object.hasOwn(r, 'data') || Object.hasOwn(r, 'error') : !r.error || Object.hasOwn(r, 'data')) throw new CrosstalkError('INVALID_RESULT', 'Invalid tool result envelope.');
}
// Responses strict mode requires every property; optional adapter inputs become nullable.
export function strictInputSchema(tool: CrosstalkToolDefinition): JsonSchema {
  function convert(value: any): any {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(convert);
    const copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
    if (copy.type === 'object') {
      const required = new Set(copy.required ?? []);
      copy.properties = Object.fromEntries(Object.entries(copy.properties ?? {}).map(([key, v]) => [key, required.has(key) ? v : { anyOf: [v, { type: 'null' }] }]));
      copy.required = Object.keys(copy.properties); copy.additionalProperties = false;
    }
    return copy;
  }
  return convert(tool.inputSchema);
}
export function normalizeArguments(tool: CrosstalkToolDefinition, args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const required = new Set(tool.inputSchema.required as string[] ?? []);
  return Object.fromEntries(Object.entries(args).filter(([k, v]) => v !== null || required.has(k)));
}

export const invocationSchema = objectSchema({ type: { const: 'tool.invoke' }, invocationId: { type: 'string', minLength: 1, maxLength: 256 }, sessionId: { type: 'string', minLength: 1, maxLength: 256 }, delegationId: { type: 'string', minLength: 1, maxLength: 256 }, tool: { type: 'string', minLength: 1, maxLength: 64 }, arguments: {}, explicitUserRequest: { type: 'boolean' }, confirmed: { type: 'boolean' }, expiresAt: { type: 'number', minimum: 0 } });
export function validateInvocation(value: unknown) {
  validate(invocationSchema, value);
}

import { homedir } from 'node:os';
import { join } from 'node:path';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

export const defaults = {
  OPENAI_API_KEY: '', CROSSTALK_LIVE_MODEL: 'gpt-live-1', CROSSTALK_REASONING_MODEL: 'gpt-6-astra',
  CROSSTALK_REASONING_EFFORT: 'medium', CROSSTALK_VOICE: 'quartz',
  CROSSTALK_LOG_TRANSCRIPTS: 'false', CROSSTALK_DEBUG: 'false',
};
export type ConfigKey = keyof typeof defaults;
/** Strict, atomic dotenv reader. Values are data; no shell commands are evaluated. */
export function parseConfig(text: string, inherited: Record<string, string | undefined> = {}) {
  const values: Record<string, string> = Object.create(null);
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let offset = 0;
  while (offset < source.length) {
    const whitespace = /^[ \t\n]*(?:#[^\n]*(?:\n|$)[ \t\n]*)*/.exec(source.slice(offset))![0];
    offset += whitespace.length; if (offset === source.length) break;
    const key = /^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*/.exec(source.slice(offset));
    if (!key || key[1]!.length > 256) throw new Error('Invalid dotenv assignment');
    offset += key[0].length;
    let value = ''; const quote = source[offset];
    if (quote === '"' || quote === "'" || quote === '`') {
      offset++; let closed = false;
      while (offset < source.length) {
        const char = source[offset++]!;
        if (char === quote) { closed = true; break; }
        if (char === '\\' && source[offset] === quote) value += source[offset++]!;
        else value += char;
      }
      if (!closed) throw new Error('Unclosed dotenv quote');
      const tail = /^[ \t]*(?:#[^\n]*)?(?:\n|$)/.exec(source.slice(offset));
      if (!tail) throw new Error('Invalid dotenv trailing text');
      offset += tail[0].length;
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else {
      const line = /^[^\n]*/.exec(source.slice(offset))![0]; offset += line.length;
      value = line.split('#')[0]!.trim();
    }
    values[key[1]!] = value;
  }
  const expanded: Record<string, string> = Object.create(null);
  const visiting = new Set<string>();
  const expand = (key: string): string => {
    if (inherited[key] !== undefined) return inherited[key]!;
    if (key in expanded) return expanded[key]!;
    if (visiting.has(key)) return '$' + key; // Bun breaks cyclic substitutions rather than evaluating code.
    if (visiting.size > 128) throw new Error('Dotenv expansion is too deep');
    visiting.add(key);
    expanded[key] = (values[key] ?? '').replace(/\\\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (match, braced, fallback, plain) => match === '\\$' ? '$' : (fallback !== undefined ? expand(braced) || fallback : expand(braced ?? plain)));
    if (expanded[key]!.length > 65536) throw new Error('Expanded dotenv value exceeds 64 KiB');
    visiting.delete(key); return expanded[key]!;
  };
  for (const key of Object.keys(values)) values[key] = expand(key);
  return values;
}
export async function loadDesktopConfig(env: Record<string, string | undefined> = process.env, path = join(homedir(), '.conf/crosstalk/crosstalk.cfg')) {
  const diagnostics: string[] = []; let shared: Record<string, string> = {}; let valid = true;
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      if (!(await file.stat()).isFile()) throw new Error('Not a regular file');
      const buffer = Buffer.alloc(65537); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 65536) throw new Error('Configuration exceeds 64 KiB');
      shared = parseConfig(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead)), env);
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { valid = false; diagnostics.push(`Cannot read valid dotenv configuration at ${path}. Voice is disabled.`); }
  }
  const values = { ...defaults }; const provenance: Record<string, string> = {};
  for (const key of Object.keys(defaults) as ConfigKey[]) {
    values[key] = env[key] ?? shared[key] ?? defaults[key];
    provenance[key] = env[key] !== undefined ? 'environment/.env' : shared[key] !== undefined ? 'shared' : 'default';
    if (key !== 'OPENAI_API_KEY' && (!values[key].trim() || values[key].length > 256)) { valid = false; diagnostics.push(`Invalid ${key}. Voice is disabled.`); }
  }
  for (const key of Object.keys(shared)) if (key.startsWith('CROSSTALK_') && !(key in defaults)) diagnostics.push(`Unknown configuration key: ${key}`);
  for (const key of ['CROSSTALK_LOG_TRANSCRIPTS', 'CROSSTALK_DEBUG'] as const) if (!['true', 'false'].includes(values[key])) { valid = false; diagnostics.push(`Invalid ${key}; expected true or false.`); }
  if (!['low', 'medium', 'high'].includes(values.CROSSTALK_REASONING_EFFORT)) { valid = false; diagnostics.push('Invalid CROSSTALK_REASONING_EFFORT; expected low, medium, or high.'); }
  return { path, provenance, diagnostics, voiceEnabled: valid && !!values.OPENAI_API_KEY, options: {
    openAIKey: valid ? values.OPENAI_API_KEY : '', liveModel: values.CROSSTALK_LIVE_MODEL,
    reasoningModel: values.CROSSTALK_REASONING_MODEL, reasoningEffort: (valid ? values.CROSSTALK_REASONING_EFFORT : 'medium') as 'low' | 'medium' | 'high',
    voice: values.CROSSTALK_VOICE, debug: values.CROSSTALK_DEBUG === 'true', logTranscripts: values.CROSSTALK_LOG_TRANSCRIPTS === 'true',
  } };
}

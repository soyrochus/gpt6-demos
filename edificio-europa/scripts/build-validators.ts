import Ajv from '../../cross-talk/node_modules/ajv';
import standalone from '../../cross-talk/node_modules/ajv/dist/standalone';
import { registrationSchema, invocationSchema, resultSchema } from '../../cross-talk/src/protocol/validation';
import { createEuropaCrosstalkAdapter } from '../crosstalk/adapter';
import type { EuropaController } from '../crosstalk/EuropaController';
import { join } from 'node:path';
/** Compile this app's finite schema set at build time so the native WebView never needs unsafe-eval. */
export async function buildValidators(output: string) {
  const app = createEuropaCrosstalkAdapter({} as EuropaController, true);
  const schemas = [registrationSchema, invocationSchema, resultSchema, app.manifest.stateSchema, ...app.tools.map(t => t.definition.inputSchema)];
  const unique = [...new Map(schemas.map(schema => [JSON.stringify(schema), schema])).entries()];
  const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false, ownProperties: true, code: { source: true, esm: true } });
  const exports: Record<string, string> = {};
  unique.forEach(([,schema],i) => { ajv.addSchema(schema, `schema${i}`); exports[`v${i}`] = `schema${i}`; });
  await Bun.write(join(output,'validators.js'), standalone(ajv, exports));
  const path = join(output, 'validation-runtime.js');
  await Bun.write(path, `import * as validators from './validators.js';\nconst cache=new Map(${JSON.stringify(unique.map(([key],i)=>[key,`v${i}`]))}.map(([key,name])=>[key,validators[name]]));\nexport default {compile(schema){const validate=cache.get(JSON.stringify(schema));if(!validate)throw new Error('Schema is not part of this desktop build.');return validate;},errorsText(){return 'Value does not match the application schema.';}};`);
  return path;
}

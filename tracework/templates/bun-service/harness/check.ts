import { cp,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const checks:{id:string;origin:string;result:string;message:string;objectIds:string[]}[]=[];
const add=(id:string,pass:boolean,message:string)=>checks.push({id,origin:'deterministic',result:pass?'pass':'block',message,objectIds:[]});
async function command(args:string[]){const p=Bun.spawn(args,{cwd:'/work',stdout:'pipe',stderr:'pipe',env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',SERVICE_DATABASE:'/tmp/service.sqlite'}});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);return {code,log:(out+err).slice(-15000)}}
add('runtime',Bun.version==='1.4.4',`Bun ${Bun.version}`);
const types=await command(['bun','--bun','node_modules/typescript/bin/tsc','--noEmit']);add('typescript',types.code===0,types.log||'Type checking passed');
let staticPass=true;for await(const p of new Bun.Glob('src/generated/**/*.ts').scan('/work')){const code=await Bun.file('/work/'+p).text();if(/Bun\.(spawn|spawnSync)|child_process|process\.env\.(OPENAI|HOME)|eval\(/.test(code))staticPass=false}add('static',staticPass,'Generated code static restrictions');
const migration=await command(['bun','-e',"import {Database} from 'bun:sqlite';import {applyMigrations} from './src/generated/migrate.ts';const db=new Database('/tmp/migration.sqlite');applyMigrations(db);if(db.query('PRAGMA integrity_check').get().integrity_check!=='ok')process.exit(1);console.log(JSON.stringify(db.query('select sqlite_version() as version').get()));db.close();"]);add('migration',migration.code===0,migration.log);
const contract=await command(['bun','/trusted/harness/acceptance.ts']);add('contract',contract.code===0,contract.log||'Immutable contract checks passed');
const tests=await command(['bun','test','tests/generated']);add('generated-tests',tests.code===0,tests.log);
console.log(JSON.stringify({bun:Bun.version,contractHash:createHash('sha256').update(await Bun.file('/input/contract.json').text()).digest('hex'),checks}));process.exit(checks.every(c=>c.result==='pass')?0:1);

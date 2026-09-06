import { parseArgs } from 'node:util';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const {values}=parseArgs({options:{dir:{type:'string'},brief:{type:'string'},out:{type:'string'},revision:{type:'string',default:'0'},label:{type:'string',default:'Imported storefront'}}});
try {
  if(!values.dir || !values.brief || !values.out)throw Error('Usage: node scripts/pack-storefront.mjs --dir PROJECT --brief brief.json --out source-project.json [--revision 0] [--label Name]');
  const root=resolve(values.dir),files=[];
  async function scan(directory,prefix='') {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      if(entry.name.startsWith('.') || ['dist','node_modules','build'].includes(entry.name))continue;
      if(entry.isSymbolicLink())throw Error('Symlinks are not supported');
      const path=prefix+entry.name;
      if(entry.isDirectory()){await scan(join(directory,entry.name),path+'/');continue;}
      const binary=/\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i.test(path);
      if(!binary && !/\.(html|css|js|mjs|json|md|txt)$/i.test(path))continue;
      if(/(?:credentials|secrets?)\.json$/i.test(path))throw Error('Private configuration cannot be packaged');
      const bytes=await readFile(join(directory,entry.name));files.push({path,content:bytes.toString(binary?'base64':'utf8'),encoding:binary?'base64':'utf8'});
    }
  }
  await scan(root);
  const revision=Number(values.revision);if(!Number.isInteger(revision)||revision<0)throw Error('Invalid revision');
  const body=JSON.stringify({revision,label:values.label,brief:JSON.parse(await readFile(values.brief,'utf8')),files},null,2);
  if(Buffer.byteLength(body)>1_000_000)throw Error('This import exceeds the HTTP limit. Use Studio image uploads and generation to bundle larger assets.');
  await writeFile(values.out,body,{flag:'wx',mode:0o600});console.log(`Packaged ${files.length} files into ${values.out}. Review the public configuration before importing.`);
}catch(error){console.error(error.message);process.exitCode=1;}

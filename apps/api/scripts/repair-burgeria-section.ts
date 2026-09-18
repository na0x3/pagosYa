/** One-store recovery, authorized 2026-09-13. Dry-run by default; --apply requires revision 2. */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { nextSourceFile, compileNextPreview } from '../src/stores/source-next';
import { sourceHomeRegions, sourceSectionScope, validateSourceEditScope, sourceDesignAfterSectionEdit } from '../src/stores/source-edit-scope';
import { savedSourceDesign } from '../src/stores/source-design';
import { withSourceAssets, sourceAssetInventory } from '../src/stores/source-asset-library';
import { buildSourceVisualSystem } from '../src/stores/source-visual-system';
import { sourceMotionMode } from '../src/stores/source-motion';
import { sourceProjectDigest } from '../src/stores/source-project';

const storeId = 'cmtzf4huh000517sjb76vzeyy';
const request = 'Añade una sección de preparación orgánica';
const css = [
  '/* Preparación: paleta y tipografía del diseño aprobado. */',
  '.prep-section{padding:clamp(64px,8vw,120px) clamp(22px,8vw,130px);background:var(--yellow);color:var(--ink)}',
  '.prep-heading{max-width:760px;margin-bottom:40px}',
  '.prep-heading h2{font:800 clamp(40px,6vw,76px)/1.12 var(--display);letter-spacing:-.035em;margin:0 0 24px;color:var(--wine)}',
  '.prep-heading>p:last-child{font-size:18px;line-height:1.6;max-width:55ch}',
  '.prep-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;border-top:2px solid var(--ink)}',
  '.prep-step{padding-top:24px}',
  '.prep-step .step-number{font:700 14px/1.5 var(--body)}',
  '.prep-step h3{font:700 clamp(25px,3vw,36px)/1.2 var(--display);margin:16px 0 12px}',
  '.prep-step p{font-size:16px;line-height:1.6;max-width:28ch}',
  '.prep-action{margin-top:32px}',
  '@media(max-width:760px){.prep-steps{grid-template-columns:1fr;gap:8px}.prep-step{padding:24px 0;border-bottom:1px solid var(--line)}}',
].join('\n');
// Existing multiline headings visibly overlapped. Preserve fonts, palette and copy.
const readability = [
  '/* Reparación de legibilidad solicitada junto a la recuperación. */',
  '.hero-copy h1{line-height:1}',
  '.hero-line{line-height:1.08}',
  '.manifesto-word{line-height:1.08}',
  '.menu-header h2,.archive-pages h2,.message-page h2,.runtime-heading h1{line-height:1.12}',
  '.archive-note p{line-height:1.08}',
  '.message-sticker{line-height:1;opacity:.2;pointer-events:none}',
].join('\n');
async function main() {
  const db = new PrismaClient();
  try {
    const store = await db.store.findUniqueOrThrow({where:{id:storeId},select:{merchantId:true,sourceProject:{select:{revision:true}}}});
    if (store.sourceProject?.revision !== 2) throw new Error('Current revision changed; recovery must be reviewed again.');
    const versions = await db.storeSourceVersion.findMany({where:{storeId,revision:{in:[1,2]}},orderBy:{revision:'asc'}});
    if (versions.length !== 2) throw new Error('Expected revisions 1 and 2.');
    const [old, recent] = versions.map(v => v.snapshot as any);
    const source = old.files.filter((f:any) => nextSourceFile(f.path));
    const prep = sourceHomeRegions(recent.files).find(r => r.id === 'preparacion-organica');
    if (!prep) throw new Error('The requested preparation section is absent.');
    const cleanPrep = prep.text.replace(/<div className="step-mark [^"]+" aria-hidden="true"><\/div>/g, '');
    let files = source.map((f:any) => ({...f,content:f.path==='components/home.tsx'
      ? f.content.replace('<section id="menu-pendiente"', cleanPrep + '\n\n    <section id="menu-pendiente"')
      : f.path==='styles/globals.css' ? f.content + '\n' + css : f.content}));
    const scope = sourceSectionScope(source, request);
    validateSourceEditScope(source, files, request, scope);
    // The authorized recovery also addresses overlap, separately from the section insertion.
    files = files.map((f:any) => f.path==='styles/globals.css' ? {...f,content:f.content+'\n'+readability} : f);
    await compileNextPreview(files);
    const design = sourceDesignAfterSectionEdit(savedSourceDesign(old.files) || undefined, files, scope);
    const replaced = new Set(files.map((f:any)=>f.path));
    const combined = await withSourceAssets([...recent.files.filter((f:any)=>!replaced.has(f.path) && !['design-direction.json','visual-system.json','visual-assets.json'].includes(f.path)),...files],old.files);
    combined.push({path:'design-direction.json',content:JSON.stringify(design,null,2)});
    combined.push({path:'visual-system.json',content:JSON.stringify(buildSourceVisualSystem(sourceMotionMode(recent.files),sourceAssetInventory(combined),design),null,2)});
    const label = 'Recuperar diseño y fotos aprobados; conservar preparación orgánica';
    const input = {revision:2,label,brief:recent.brief,files:combined};
    console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',storeId,baseRevision:2,
      recoveredFrom:1,sections:sourceHomeRegions(files).map(r=>r.id),photos:sourceAssetInventory(combined).filter(a=>a.kind==='image'&&a.references.length).map(a=>a.path),
      protectedHeader:files.find((f:any)=>f.path==='components/Header.tsx').content===source.find((f:any)=>f.path==='components/Header.tsx').content},null,2));
    if (!process.argv.includes('--apply')) return;
    const service = new SourceProjectsService(db as any);
    const saved = await service.save(store.merchantId,storeId,input);
    const originalMessage = await db.storeAgentMessage.findFirst({where:{thread:{storeId},channel:'source',role:'ASSISTANT',metadata:{path:['sourceRevision'],equals:1}},orderBy:{createdAt:'desc'}});
    const thread = await db.storeAgentThread.findUniqueOrThrow({where:{storeId}});
    const setup = (originalMessage?.metadata as any)?.sourceSetup;
    await db.storeAgentMessage.create({data:{threadId:thread.id,role:'ASSISTANT',channel:'source',
      content:'Recuperé la portada, las fotos y los enlaces del diseño anterior. Conservé la sección de preparación orgánica y ajusté el interlineado de los títulos. Esta recuperación no usó créditos de IA.',
      metadata:{sourceRevision:saved.revision,label,...(setup?{sourceSetup:{...setup,assetUrls:[],answers:{context:setup.answers.context+'\nLa sección de preparación orgánica está aprobada. Conservar fotos editoriales, navegación y composición en futuras ediciones locales.'}}}:{})}}});
    const untouched = await db.storeSourceVersion.findMany({where:{storeId,revision:{in:[1,2]}},orderBy:{revision:'asc'}});
    if (untouched.some((v,i)=>sourceProjectDigest(v.snapshot as any)!==sourceProjectDigest(versions[i].snapshot as any))) throw new Error('History verification failed.');
    console.log(JSON.stringify({savedRevision:saved.revision,historyPreserved:true,published:false,aiCalls:0}));
  } finally { await db.$disconnect(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

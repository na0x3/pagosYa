import {test,expect} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
const repairFile=new URL('../../../tmp/fhasin-repair/prepared.json',import.meta.url);
test.skip(!existsSync(repairFile),'Local recovery snapshot is not checked into source control.');
test('repaired FHASIN displays eight original photos without overflow or colliding headings',async({page})=>{
  page.on('pageerror',error=>console.log('BROWSER ERROR',error.message));
  await page.goto('/');
  const snapshot=JSON.parse(readFileSync(repairFile,'utf8'));
  const checks=await page.evaluate(async snapshot=>{const {checkSourceWebsite}=await import('/src/source-checks.ts');return checkSourceWebsite(snapshot)},snapshot);
  console.log(JSON.stringify(checks.filter(row=>row.status==='failed'||row.status==='warning'||row.blocking),null,2));
  expect(checks.filter(row=>row.label.includes('Ancho de la página')).every(row=>row.status==='passed')).toBe(true);
  expect(checks.filter(row=>row.label.includes('Líneas de título superpuestas'))).toEqual([]);
  expect(checks.filter(row=>row.label.includes('Imágenes cargadas')).every(row=>row.status==='passed')).toBe(true);
  expect(checks.filter(row=>row.status==='failed')).toEqual([]);
});

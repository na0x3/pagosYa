import { sourceProjectSnapshot } from './source-project';
import { preparedSourceArtifact, assertPreparedSource } from './source-prepared-artifact';
const input: any = { revision: 0, label: 'Store', brief: { businessType: 'Shop', audience: 'People', primaryAction: 'Shop', visualDirection: 'Simple' }, files: [{ path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: 'Test site' }, { path: 'index.html', content: '<h1>Shop</h1>' }, { path: 'styles.css', content: 'body{color:#111}' }, { path: 'site.js', content: '// site' }] };
it('pins prepared bytes and rejects changes after evidence was collected', () => {
  const prepared = sourceProjectSnapshot(input);
  prepared.files.find(f => f.path === 'index.html')!.content = '<h1>Normalized Shop</h1>';
  const artifact = preparedSourceArtifact(input, prepared);
  prepared.files.find(f => f.path === 'index.html')!.content = 'later mutation';
  expect(assertPreparedSource(input, artifact).files.find(f => f.path === 'index.html')!.content).toBe('<h1>Normalized Shop</h1>');
  expect(artifact.transformedPaths).toEqual(['index.html']);
  expect(() => assertPreparedSource({ ...input, revision: 99 }, artifact)).toThrow();
  const changed = structuredClone(input); changed.files.find((f: any) => f.path === 'index.html').content = '<h1>Different</h1>';
  expect(() => assertPreparedSource(changed, artifact)).toThrow('después de comprobarse');
  expect(() => assertPreparedSource(input, { ...artifact, digest: 'wrong' })).toThrow();
});

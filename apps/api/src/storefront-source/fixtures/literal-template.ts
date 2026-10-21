import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';

/**
 * Test fixture: a converted Plantilla (spec 2026-10-20) with its copy slots written back as literal text in the
 * components, the way YAPI-built stores and stores applied before the conversion carry their words.
 */
export function literalTemplateSource(id: string) {
  const words = Object.fromEntries((templateManifest(id)?.copy ?? []).map(slot => [slot.key, slot.default]));
  const word = (key: string) => words[key] ?? '';
  return templateSourceFiles(id).map(file => {
    if (!/^components\/(home|Shell|product)\.tsx$/.test(file.path)) return file;
    const content = file.content
      .replace(/=\{copy\.([a-z]+_\d+)\}/g, (_, key) => (word(key).includes('"') ? `={${JSON.stringify(word(key))}}` : `="${word(key)}"`))
      .replace(/\{copy\.([a-z]+_\d+)\}/g, (_, key) => (/[{}<>]/.test(word(key)) ? `{${JSON.stringify(word(key))}}` : word(key)))
      .replace(/\bcopy\.([a-z]+_\d+)\b/g, (_, key) => JSON.stringify(word(key)))
      .replace(/import \{([^}]*)\} from '\.\/store-data'/, (_, names: string) => `import { ${names.split(',').map(name => name.trim()).filter(name => name && name !== 'copy').join(', ')} } from './store-data'`);
    return { ...file, content };
  });
}

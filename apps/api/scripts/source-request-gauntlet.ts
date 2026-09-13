import { sourceRedesignRequested } from '../src/stores/source-context';
import { sourceRequestProfile, type SourceVisualDomain } from '../src/stores/source-request-profile';

type Case = {
  label: string;
  prompt: string;
  scope: 'full-redesign' | 'visual-refinement' | 'targeted-visual' | 'functional-or-content';
  domains?: SourceVisualDomain[];
  notDomains?: SourceVisualDomain[];
  redesign?: boolean;
};

const allDomains: SourceVisualDomain[] = [
  'typography', 'spacing', 'palette', 'icons', 'background', 'motion', 'header', 'footer',
  'responsive', 'product', 'cart', 'checkout',
];

/**
 * Cheap, provider-free regression matrix for the short requests merchants actually write.
 * Keep this broad: it protects the classifier and prompt routing before any model call happens.
 */
const cases: Case[] = [
  { label: 'vague Spanish beauty', prompt: 'Hazlo más bonito y profesional', scope: 'visual-refinement', domains: allDomains },
  { label: 'vague premium Spanish', prompt: 'Que se vea premium', scope: 'visual-refinement', domains: allDomains },
  { label: 'vague elegant Spanish', prompt: 'Hazlo elegante', scope: 'visual-refinement', domains: allDomains },
  { label: 'vague English', prompt: 'Make it look better', scope: 'visual-refinement', domains: allDomains },
  { label: 'vague English professional', prompt: 'Make the store feel professional', scope: 'visual-refinement', domains: allDomains },
  { label: 'design improvement', prompt: 'Improve the design', scope: 'visual-refinement', domains: allDomains },
  { label: 'mobile fix', prompt: 'Arregla el móvil', scope: 'targeted-visual', domains: ['responsive'] },
  { label: 'mobile typo', prompt: 'arregla el mobil', scope: 'targeted-visual', domains: ['responsive'] },
  { label: 'title only', prompt: 'Solo cambia el título', scope: 'targeted-visual', domains: ['typography'] },
  { label: 'footer icons', prompt: 'Cambia los iconos del footer', scope: 'targeted-visual', domains: ['icons', 'footer'], notDomains: ['checkout'] },
  { label: 'top icons', prompt: 'Cambia los iconos de arriba', scope: 'targeted-visual', domains: ['icons', 'header'] },
  { label: 'colors only', prompt: 'Cambia los colores', scope: 'targeted-visual', domains: ['palette'] },
  { label: 'background motion', prompt: 'Pon una animación de fondo', scope: 'targeted-visual', domains: ['motion', 'background'] },
  { label: 'remove motion', prompt: 'Quita las animaciones', scope: 'targeted-visual', domains: ['motion'] },
  { label: 'readability', prompt: 'Haz que las letras sean legibles', scope: 'targeted-visual', domains: ['typography'] },
  { label: 'product cards', prompt: 'Mejora las tarjetas de producto', scope: 'targeted-visual', domains: ['product'] },
  { label: 'cart', prompt: 'Arregla el carrito', scope: 'targeted-visual', domains: ['cart'] },
  { label: 'checkout', prompt: 'Mejora el checkout', scope: 'targeted-visual', domains: ['checkout'] },
  { label: 'same photos redesign', prompt: 'Rediseña toda la página usando las mismas fotos', scope: 'full-redesign', domains: allDomains, redesign: true },
  { label: 'complete Spanish redesign', prompt: 'Rediseña la página entera', scope: 'full-redesign', domains: allDomains, redesign: true },
  { label: 'complete English redesign', prompt: 'Make the whole site look completely different', scope: 'full-redesign', domains: allDomains, redesign: true },
  { label: 'fresh direction', prompt: 'Give my site a fresh visual direction', scope: 'full-redesign', domains: allDomains, redesign: true },
  { label: 'all colors and sections', prompt: 'Change all colors and sections', scope: 'full-redesign', domains: allDomains, redesign: true },
  { label: 'add product', prompt: 'Agrega una torta de chocolate a productos', scope: 'functional-or-content' },
  { label: 'change price', prompt: 'Cambia el precio del café', scope: 'functional-or-content' },
  { label: 'business hours', prompt: 'Actualiza el horario de atención', scope: 'functional-or-content' },
  { label: 'link request', prompt: 'Agrega el enlace de Instagram', scope: 'functional-or-content' },
  { label: 'negative redesign', prompt: 'No rediseñes el sitio, solo cambia el título', scope: 'targeted-visual', domains: ['typography'], redesign: false },
  { label: 'negative English redesign', prompt: "Don't redesign the site, only fix the footer", scope: 'targeted-visual', domains: ['footer'], redesign: false },
];

const promptVariants = (prompt: string) => [...new Set([
  prompt,
  prompt.toUpperCase(),
  prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  prompt.replace(/\s+/g, '  '),
  prompt.replace(/\bmobile\b/gi, 'mobil'),
])];

const failures: string[] = [];
for (const existingSite of [false, true]) {
  for (const testCase of cases) {
    for (const prompt of promptVariants(testCase.prompt)) {
      const profile = sourceRequestProfile(prompt, existingSite);
      const actualRedesign = sourceRedesignRequested(prompt);
      const prefix = `${existingSite ? 'existing' : 'new'} / ${testCase.label} / "${prompt}"`;
      if (profile.scope !== testCase.scope) failures.push(`${prefix}: scope=${profile.scope}, expected=${testCase.scope}`);
      if (testCase.redesign !== undefined && actualRedesign !== testCase.redesign) {
        failures.push(`${prefix}: redesign=${actualRedesign}, expected=${testCase.redesign}`);
      }
      for (const domain of testCase.domains || []) {
        if (!profile.visualDomains.includes(domain)) failures.push(`${prefix}: missing domain ${domain}`);
      }
      for (const domain of testCase.notDomains || []) {
        if (profile.visualDomains.includes(domain)) failures.push(`${prefix}: unexpected domain ${domain}`);
      }
    }
  }
}

const checks = cases.reduce((total, testCase) => total + promptVariants(testCase.prompt).length, 0) * 2;
if (failures.length) {
  console.error(`SOURCE REQUEST GAUNTLET FAILED: ${failures.length} assertion(s) across ${checks} cases`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`SOURCE REQUEST GAUNTLET PASSED: ${checks} cases across new and existing sites`);
}

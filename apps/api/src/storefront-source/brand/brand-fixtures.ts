// A test brief shared by the brand specs (no runtime use).
import type { BrandBrief } from './brand-brief-types';

export const BRIEF: BrandBrief = {
  version: 1, createdAt: '2026-11-18T12:00:00.000Z', storeName: 'Calima',
  research: { niche: 'salsas picantes', audience: 'cocineros', references: [{ name: 'Heinz', why: 'icónica' }, { name: "Frank's RedHot", why: 'promesa' }, { name: 'Cholula', why: 'tapa' }], patterns: ['Receta junto al producto', 'Escala de picante'], searched: false },
  identity: { mode: 'new', palette: { ink: '#3B1F14', primary: '#B4400A', accent: '#F2C342', secondary: '#7AA62E', base: '#F8F1E4' }, fonts: { display: 'oswald', secondary: 'fraunces', body: 'instrument' },
    oneLiner: 'Una paleta de sol tibio y letra firme y cercana.', voice: 'de tú', photoDirection: 'luz de tarde',
    scene: { backdropHex: '#F8F1E4', backdropMode: 'paper', lightDirection: 'window-left', cameraElevation: 'three-quarter', fillFraction: 0.68, aspect: 'landscape', shadow: 'soft-contact' } },
  shots: [], inputs: { images: 0, text: true },
};

import { describe, expect, it } from 'vitest';
import { stepLines, stepSentence } from './source-step-words';
import { narrationFromProgress } from './source-narration';

const progress = (labels: string[]) => ({ status: 'running', startedAt: 0, updatedAt: 0,
  steps: [{ stage: 'building', label: 'Construyendo los cambios', startedAt: 0, status: 'running', details: labels.map(label => ({ label })) }] }) as any;

describe('plain step sentences', () => {
  it('turns every agent step into a sentence without a path', () => {
    const cases: Record<string, string> = {
      'Leyó components/store-data.tsx': 'Estoy mirando cómo está hecha tu tienda',
      'Editó styles/globals.css': 'Estoy cambiando los colores y las letras',
      'Escribió components/brands.tsx': 'Estoy armando una sección nueva',
      'Editó components/home.tsx': 'Estoy ajustando la portada',
      'Editó components/product.tsx': 'Estoy ajustando la página de producto',
      'Editó components/checkout.tsx': 'Estoy ajustando el pago',
      'Editó components/story.tsx': 'Estoy ajustando una sección',
      'Creó la página nosotros.html': 'Estoy creando una página nueva',
      'Borró components/old.tsx': 'Estoy quitando lo que ya no se usa',
      'Buscó productos: proteína': 'Estoy buscando tus productos',
      'Inspeccionó assets/image-1.jpg': 'Estoy mirando tus fotos',
      'Capturó index.html (móvil)': 'Estoy revisando que se vea bien en el celular',
      'Capturó index.html (escritorio)': 'Estoy revisando cómo se ve en la computadora',
      'Buscó ilustraciones: hojas': 'Estoy eligiendo ilustraciones',
      'Eligió la identidad de la ficha de producto': 'Estoy dándole estilo a las fichas de producto',
      'Actualizó la política de envíos': 'Estoy escribiendo tus políticas',
      'Diseñó las páginas de cuenta': 'Estoy diseñando las páginas de cuenta',
    };
    for (const [label, sentence] of Object.entries(cases)) expect([label, stepSentence(label)]).toEqual([label, sentence]);
  });
  it('plan lines and the finish say nothing here; an unknown step is neutral', () => {
    expect(stepSentence('Voy a: poner una sección por marca')).toBeNull();
    expect(stepSentence('Planificó 4 requisitos')).toBeNull();
    expect(stepSentence('Terminó')).toBeNull();
    expect(stepSentence('Compiló components/x.tsx con 3 avisos')).toBe('Estoy trabajando en tu tienda');
  });
  it('collapses repeats and keeps the newest few', () => {
    expect(stepLines(progress(['Leyó a.tsx', 'Leyó b.tsx', 'Editó styles/globals.css', 'Editó styles/x.css', 'Capturó index.html (móvil)'])))
      .toEqual(['Estoy mirando cómo está hecha tu tienda', 'Estoy cambiando los colores y las letras', 'Estoy revisando que se vea bien en el celular']);
    expect(stepLines(progress(['Leyó a', 'Editó styles/a.css', 'Capturó i (móvil)', 'Editó components/home.tsx']), 2)).toHaveLength(2);
    expect(stepLines(null)).toEqual([]);
  });
  it('the narration\'s current line is plain in pill mode and never carries a path', () => {
    const n = narrationFromProgress(progress(['Leyó components/store-data.tsx']), true);
    expect(n.lines.at(-1)).toBe('Estoy mirando cómo está hecha tu tienda…');
    expect(JSON.stringify(n)).not.toMatch(/\.tsx|\.css|Leyó/);
  });
  it('in pill mode the plain step shows under the plan even when both come from the same stage (real runs)', () => {
    const n = narrationFromProgress(progress(['Voy a: poner una sección por marca', 'Leyó components/store-data.tsx']), true);
    expect(n.lines[0]).toBe('Voy a:');
    expect(n.lines.at(-1)).toBe('Estoy mirando cómo está hecha tu tienda…');
  });
});

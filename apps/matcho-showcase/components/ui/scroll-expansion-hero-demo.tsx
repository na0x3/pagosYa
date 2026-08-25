import ScrollExpandMedia from "@/components/ui/scroll-expansion-hero";

export default function ScrollExpansionHeroDemo() {
  return (
    <ScrollExpandMedia
      mediaType="image"
      mediaSrc="/matcho/hero.png"
      bgImageSrc="/matcho/background.png"
      title="El ritual MATCHO"
      date="Hecho al momento"
      scrollToExpand="Desplázate para abrir la imagen"
      textBlend
    >
      <p className="text-sm text-white">Fotos reales, una composición expansiva y movimiento que respeta la preferencia del sistema.</p>
    </ScrollExpandMedia>
  );
}

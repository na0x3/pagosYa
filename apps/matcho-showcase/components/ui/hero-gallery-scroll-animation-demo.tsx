import { BentoCell, BentoGrid, ContainerScale, ContainerScroll } from "@/components/ui/hero-gallery-scroll-animation";
import { Button } from "@/components/ui/button";

const IMAGES = ["hero.png", "matcha-green.jpg", "matcha-strawberry.jpg", "matcha-black.jpg", "gallery-1.jpg"];

export default function HeroGalleryScrollAnimationDemo() {
  return (
    <ContainerScroll className="h-[280svh] bg-background">
      <BentoGrid className="sticky left-0 top-0 h-svh w-full p-4">
        {IMAGES.map((image) => (
          <BentoCell key={image} className="overflow-hidden rounded-xl shadow-xl">
            <img className="size-full object-cover" src={`/matcho/${image}`} alt="" />
          </BentoCell>
        ))}
      </BentoGrid>
      <ContainerScale className="z-10 text-center">
        <h1 className="max-w-xl text-5xl font-bold tracking-tighter text-foreground">Tu historia abre la galería.</h1>
        <p className="my-6 max-w-xl text-sm text-muted-foreground md:text-base">Una composición creada con las imágenes reales de la tienda.</p>
        <Button>Ver productos</Button>
      </ContainerScale>
    </ContainerScroll>
  );
}

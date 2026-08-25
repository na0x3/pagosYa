import ImageStreamHero from "@/components/ui/image-stream-hero";

const IMAGES = ["matcha-green.jpg", "matcha-strawberry.jpg", "matcha-black.jpg", "gallery-1.jpg", "gallery-2.png", "hero.png"].map((name) => ({ src: `/matcho/${name}`, alt: "Escena visual MATCHO" }));

export default function ImageStreamHeroDemo() {
  return (
    <ImageStreamHero images={IMAGES} className="h-[640px] w-full bg-background">
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <h2 className="max-w-[10ch] text-5xl font-semibold tracking-tight text-foreground sm:text-7xl">Tu marca, en movimiento.</h2>
      </div>
    </ImageStreamHero>
  );
}

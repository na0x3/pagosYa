import { StaggerTestimonials } from "@/components/ui/stagger-testimonials";

const REVIEWS = [
  { id: 1, testimonial: "El matcha sabe fresco y llega exactamente como lo imaginaba.", by: "Ana, cliente frecuente", imgSrc: "/matcho/matcha-green.jpg" },
  { id: 2, testimonial: "La carta es corta, clara y cada opción tiene una personalidad distinta.", by: "María, La Paz", imgSrc: "/matcho/matcha-strawberry.jpg" },
  { id: 3, testimonial: "Mi nueva pausa favorita. Simple, frío y muy bien presentado.", by: "Diego, cliente", imgSrc: "/matcho/matcha-black.jpg" },
];

export default function StaggerTestimonialsDemo() {
  return <StaggerTestimonials testimonials={REVIEWS} />;
}

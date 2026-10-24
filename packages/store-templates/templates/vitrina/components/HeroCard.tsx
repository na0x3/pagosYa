import { photos } from './store-data';

/** The opening's tilted photo card (harvested from an approved store's video card; a starter carries no video of its own). */
export default function HeroCard() {
  if (!photos.hero) return null;
  return <div className="vt-video-card">
    <p className="vt-video-label">Recién hecho.</p>
    <img src={photos.hero} alt="" aria-hidden="true" loading="eager" />
  </div>;
}

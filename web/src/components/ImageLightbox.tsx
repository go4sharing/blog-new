import Lightbox from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/captions.css'

export interface PreviewSlide {
  src: string
  title: string
}

export default function ImageLightbox({ slides, index, onClose }: { slides: PreviewSlide[]; index: number; onClose: () => void }) {
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Fullscreen, Captions]}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      captions={{ descriptionTextAlign: 'center' }}
      carousel={{ finite: slides.length < 2 }}
      controller={{ closeOnBackdropClick: true }}
      render={slides.length < 2 ? { buttonPrev: () => null, buttonNext: () => null } : undefined}
    />
  )
}

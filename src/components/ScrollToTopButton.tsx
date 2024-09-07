import { ArrowUp } from 'lucide-react'
import { Button } from "../components/ui/Button"

interface ScrollToTopButtonProps {
  showScrollToTop: boolean
  scrollToTop: () => void
}

export default function ScrollToTopButton({ showScrollToTop, scrollToTop }: ScrollToTopButtonProps) {
  if (!showScrollToTop) return null

  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed bottom-8 right-8 bg-amber-100 text-amber-900 rounded-full shadow-md hover:bg-amber-200 transition-all duration-300"
      onClick={scrollToTop}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-6 w-6" />
    </Button>
  )
}

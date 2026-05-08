import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, BookOpen, ExternalLink } from 'lucide-react';
import { marked } from 'marked';
import { Wordmark } from './Wordmark';
import { USAGE_MD } from '../data/usageContent';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Parse the markdown once at module load — USAGE_MD is build-time constant.
// marked() is synchronous in default config so the cast is safe.
const HTML = marked.parse(USAGE_MD, { gfm: true, breaks: false }) as string;

/**
 * Full-screen-ish modal that renders the USAGE.md manual. Same content as
 * github.com/.../USAGE.md but offline-accessible from inside the app.
 *
 * External links (anything with http(s) protocol) are intercepted and routed
 * through window.forge.openExternal so they open in the user's default
 * browser instead of trying to navigate the renderer (which we block).
 */
export function ManualModal({ open, onClose }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock background scroll while open + ESC to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Scroll back to top each time the modal re-opens
  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [open]);

  // Intercept link clicks — anchors that point at http(s) get routed through
  // the main process so they open in the system browser. Same-page anchors
  // (#section) keep their default behavior.
  const onClick = useMemo(
    () => (e: React.MouseEvent<HTMLDivElement>) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        window.forge.openExternal(href);
      }
      // # anchors and other relative refs are left alone
    },
    [],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="manual-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[55] flex items-center justify-center px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-title"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 50%, rgba(79,142,255,0.10) 0%, rgba(0,0,0,0.75) 100%)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={onClose}
          />

          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative glass-strong rounded-2xl w-[min(880px,100%)] h-[min(900px,calc(100vh-3rem))] flex flex-col overflow-hidden"
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-forge-primaryHi" />
                </div>
                <div>
                  <div
                    id="manual-title"
                    className="text-[14px] font-semibold tracking-tight text-forge-text"
                  >
                    Forge — User Manual
                  </div>
                  <div className="text-[11px] text-forge-mute">
                    Every feature, what it does, when to use it.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    window.forge.openExternal(
                      'https://github.com/Grandillionaire/forge/blob/main/USAGE.md',
                    )
                  }
                  className="btn-icon"
                  title="Open online (GitHub)"
                  aria-label="Open online version on GitHub"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="btn-icon"
                  title="Close (Esc)"
                  aria-label="Close manual"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto px-7 sm:px-10 py-7"
              onClick={onClick}
            >
              <div className="manual-prose mx-auto max-w-[68ch]">
                {/* Brand mark above the rendered content for a clean opener */}
                <div className="flex flex-col items-center mb-8">
                  <Wordmark size={28} />
                </div>
                <div dangerouslySetInnerHTML={{ __html: HTML }} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

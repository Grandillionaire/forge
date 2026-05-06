import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload } from 'lucide-react';

/**
 * Window-wide drag overlay. Listens at window scope so dragging from Finder
 * surfaces a global "drop zone" affordance regardless of which Dropzone owns
 * the inner target.
 *
 * The actual drop is handled by the inner <Dropzone>; this overlay is purely
 * visual feedback.
 */
export function DragOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let counter = 0;
    const onEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        counter += 1;
        setActive(true);
      }
    };
    const onLeave = () => {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setActive(false);
    };
    const onDrop = () => {
      counter = 0;
      setActive(false);
    };
    const prevent = (e: DragEvent) => e.preventDefault();

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 pointer-events-none"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 50%, rgba(79,142,255,0.20) 0%, rgba(0,0,0,0.65) 100%)',
            }}
          />
          <div className="absolute inset-3 rounded-[20px] border-2 border-dashed border-forge-primary/70 shadow-primaryGlow" />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="glass-strong rounded-2xl px-8 py-7 flex flex-col items-center gap-3"
            >
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-gradient shadow-primarySoft">
                <Upload className="w-6 h-6 text-black" />
              </div>
              <div className="text-[13px] uppercase tracking-wider3 text-forge-primary font-bold">
                Drop files anywhere
              </div>
              <div className="text-[12px] text-forge-text/70">
                We'll route images and videos to the right tab.
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

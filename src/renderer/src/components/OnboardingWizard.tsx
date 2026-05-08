import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Minimize2, Wand2, FileVideo2, Zap, X, ArrowRight, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Wordmark } from './Wordmark';

const STORAGE_KEY = 'forge.onboarding.completedAt';
// Bump when the wizard content changes meaningfully so existing users see it again.
// v2: added Video compress step + HEIC support note.
const VERSION = 2;

interface Props {
  forceOpen: boolean;
  onClose: () => void;
}

interface Step {
  id: string;
  title: string;
  tagline: string;
  body: string;
  icon?: LucideIcon;
  bullets?: string[];
  best?: string;
  showWordmark?: boolean;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Forge',
    tagline: 'Bulk media, locally',
    body:
      'Forge processes images and videos in bulk — entirely on your machine, on your GPU. Drop files, pick options, click go. Four tools in one app.',
    showWordmark: true,
  },
  {
    id: 'image-upscale',
    title: 'Image upscale',
    tagline: 'Tool 1 of 4',
    icon: Sparkles,
    body:
      'Make images bigger and sharper. Pick a scale (2×, 3×, 4×) and a model that matches your content.',
    bullets: [
      'Photographic, illustration, or line-art models — pick the closest match',
      'AI engine: Real-ESRGAN — downloads ~50 MB on first use, runs on your GPU',
      'No AI engine? Falls back to a high-quality Lanczos resize — still good',
      'Drops iPhone HEIC files? Forge decodes them automatically',
    ],
    best: 'Best for: low-resolution photos, screenshots, art that needs to print larger.',
  },
  {
    id: 'compress',
    title: 'Image compress',
    tagline: 'Tool 2 of 4',
    icon: Minimize2,
    body:
      'Shrink images for the web or social. Convert formats. Strip or rewrite EXIF metadata across the whole batch.',
    bullets: [
      'JPEG / WebP / AVIF — pick a quality, get smaller files',
      'Convert iPhone HEIC → JPEG so anyone can open them',
      'Strip everything (EXIF, GPS, ICC profiles) — useful before posting publicly',
      'Or keep & rewrite Artist / Copyright / Description across the whole batch',
      'Optional resize before encode — cap the longest edge at any pixel width',
    ],
    best: 'Best for: prepping images before upload, converting iPhone photos, removing GPS data.',
  },
  {
    id: 'video-upscale',
    title: 'Video upscale',
    tagline: 'Tool 3 of 4',
    icon: Wand2,
    body:
      'AI-upscale videos frame by frame. Audio is preserved. Outputs a clean H.264 MP4 with faststart.',
    bullets: [
      'Same AI engine as images — needs the engine installed',
      'MP4, MOV, MKV, WebM all supported',
      'Heavy work — figure ~minutes per second of footage at 4× on a recent Mac',
      'Tune CRF (quality vs size) and encoder preset (speed vs efficiency)',
    ],
    best: 'Best for: enhancing low-res clips, prepping legacy footage for modern displays.',
  },
  {
    id: 'video-compress',
    title: 'Video compress',
    tagline: 'Tool 4 of 4',
    icon: FileVideo2,
    body:
      'Shrink videos in bulk — downscale resolution, drop bitrate, keep audio. No AI here, just a fast single-pass FFmpeg encode.',
    bullets: [
      'Resolution presets: 1080p / 720p / 480p / 360p — never upscales, only down',
      'CRF slider for quality vs size — 18 visually lossless, 28 small, 32 tiny',
      'Audio: pick a target bitrate or copy the source as-is',
      'Order of magnitude faster than the upscale path',
    ],
    best: 'Best for: shrinking 4K → 1080p, prepping clips for upload limits, archiving footage.',
  },
  {
    id: 'tips',
    title: 'A few tips',
    tagline: 'Last one',
    icon: Zap,
    body:
      'Things that aren’t obvious from the UI but make Forge nicer to use day-to-day.',
    bullets: [
      'Drag files from Finder anywhere on the window — not just the dropzone',
      'Output folder defaults to ~/Downloads/Forge — change it any time',
      'Click "Reveal" on any finished file to open it in Finder',
      'Forge auto-updates from GitHub on every launch — no need to redownload',
      'Re-open this tour from the (?) icon at the top of the window',
    ],
  },
];

export function OnboardingWizard({ forceOpen, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Decide whether to show on mount
  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage can throw under certain sandbox conditions — treat as absent
    }
    if (!stored || Number(stored) < VERSION) {
      setStep(0);
      setOpen(true);
    }
  }, [forceOpen]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(VERSION));
    } catch {
      /* non-fatal */
    }
    setOpen(false);
    onClose();
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!open) return null;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 50%, rgba(79,142,255,0.10) 0%, rgba(0,0,0,0.7) 100%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={close}
        />

        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative glass-strong rounded-2xl w-[min(560px,100%)] max-h-[88vh] flex flex-col overflow-hidden"
        >
          <button
            onClick={close}
            className="absolute top-3 right-3 btn-icon z-10"
            title="Skip tour"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 overflow-y-auto px-7 pt-7 pb-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-col items-center text-center">
                  {current.showWordmark ? (
                    <div className="my-2">
                      <Wordmark size={32} />
                    </div>
                  ) : Icon ? (
                    <div className="w-14 h-14 rounded-2xl bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center mb-3 shadow-primarySoft">
                      <Icon className="w-6 h-6 text-forge-primaryHi" />
                    </div>
                  ) : null}

                  <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mt-2">
                    {current.tagline}
                  </div>
                  <h2
                    id="onboarding-title"
                    className="text-[22px] font-semibold tracking-tight mt-1.5 text-forge-text"
                  >
                    {current.title}
                  </h2>
                  <p className="text-[14px] text-forge-text/85 leading-relaxed mt-3 max-w-md">
                    {current.body}
                  </p>
                </div>

                {current.bullets && (
                  <ul className="space-y-2.5 text-[13px] text-forge-text/75 mt-5 max-w-md mx-auto">
                    {current.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2.5 leading-relaxed">
                        <span className="text-forge-primary mt-1 shrink-0">▸</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {current.best && (
                  <div className="mt-5 mx-auto max-w-md p-3 rounded-lg bg-white/[0.025] border border-white/[0.05] text-[12.5px] text-forge-text/65 leading-relaxed">
                    {current.best}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3 px-7 py-4 border-t border-white/[0.06] bg-black/20">
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-forge-primary' : 'w-1.5 bg-white/15 hover:bg-white/30'
                  }`}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button variant="ghost" onClick={back} icon={<ArrowLeft />}>
                  Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={close}>
                  Skip
                </Button>
              )}
              <Button onClick={next}>
                {isLast ? (
                  'Get started'
                ) : (
                  <>
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

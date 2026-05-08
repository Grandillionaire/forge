import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles,
  Minimize2,
  Wand2,
  FileVideo2,
  AudioLines,
  Upload,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  HelpCircle,
  BookOpen,
  Bot,
  MousePointer2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Wordmark } from './Wordmark';

const STORAGE_KEY = 'forge.onboarding.completedAt';
// v4: added audio convert tool. Bumps so existing users re-see the tour.
const VERSION = 4;

type ToolId =
  | 'image-upscale'
  | 'image-compress'
  | 'video-upscale'
  | 'video-compress'
  | 'audio-convert';

interface Props {
  forceOpen: boolean;
  onClose: () => void;
  // Called when the user clicks one of the four tool cards on the picker step.
  // The App switches to that tab and the wizard closes — leaving the user
  // exactly where they need to be to start working.
  onPickTool: (tool: ToolId) => void;
}

interface ToolCard {
  id: ToolId;
  icon: LucideIcon;
  title: string;
  desc: string;
}

const TOOLS: ToolCard[] = [
  { id: 'image-upscale',  icon: Sparkles,   title: 'Image upscale',  desc: 'Make images bigger and sharper with AI.' },
  { id: 'image-compress', icon: Minimize2,  title: 'Image compress', desc: 'Shrink images, convert HEIC → JPEG, control metadata.' },
  { id: 'video-upscale',  icon: Wand2,      title: 'Video upscale',  desc: 'AI-upscale videos frame by frame. Heavy work.' },
  { id: 'video-compress', icon: FileVideo2, title: 'Video compress', desc: 'Shrink videos — downscale or just drop bitrate.' },
  { id: 'audio-convert',  icon: AudioLines, title: 'Audio convert',  desc: 'MP3 ↔ WAV ↔ FLAC ↔ AAC ↔ Opus. Bitrate, sample rate.' },
];

export function OnboardingWizard({ forceOpen, onClose, onPickTool }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // "Action completed" state per step — gates the Next button on steps that
  // demand a real action so users can't speed-run past the meaning.
  const [actedDrop, setActedDrop] = useState(false);
  const [actedClickToContinue, setActedClickToContinue] = useState(false);
  const totalSteps = 5;

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setActedDrop(false);
      setActedClickToContinue(false);
      setOpen(true);
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage may throw in unusual sandboxes — treat as absent
    }
    if (!stored || Number(stored) < VERSION) {
      setStep(0);
      setOpen(true);
    }
  }, [forceOpen]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(VERSION));
    } catch { /* non-fatal */ }
    setOpen(false);
    onClose();
  };

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else close();
  };
  const back = () => step > 0 && setStep(step - 1);

  // Listen for global drag/drop events so step 2 can detect a real drop without
  // owning the dropzone — fires the "got it" celebration.
  useEffect(() => {
    if (!open || step !== 1) return;
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        setActedDrop(true);
      }
    };
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', prevent);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', prevent);
    };
  }, [open, step]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 50%, rgba(79,142,255,0.10) 0%, rgba(0,0,0,0.78) 100%)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={close}
        />

        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative glass-strong rounded-2xl w-[min(640px,100%)] max-h-[88vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={close}
            className="absolute top-3 right-3 btn-icon z-10"
            title="Skip tour"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 overflow-y-auto px-7 sm:px-10 pt-8 pb-3">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <StepWelcome
                  key="welcome"
                  onContinue={() => {
                    setActedClickToContinue(true);
                    next();
                  }}
                />
              )}
              {step === 1 && <StepDropFile key="drop" acted={actedDrop} onPracticed={() => setActedDrop(true)} />}
              {step === 2 && <StepTabsTour key="tabs" />}
              {step === 3 && (
                <StepPickTool
                  key="pick"
                  onPick={(t) => {
                    onPickTool(t);
                    close();
                  }}
                />
              )}
              {step === 4 && <StepHelp key="help" />}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3 px-7 sm:px-10 py-4 border-t border-white/[0.06] bg-black/20 shrink-0">
            <Dots step={step} total={totalSteps} onJump={(i) => setStep(i)} />
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
              {step === 0 ? (
                <Button onClick={() => { setActedClickToContinue(true); next(); }}>
                  {actedClickToContinue ? 'Onward' : "Let's go"} <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : step === 1 ? (
                <Button onClick={next}>
                  {actedDrop ? 'Continue' : 'Skip drop · Next'} <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : step < totalSteps - 1 ? (
                <Button onClick={next}>
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Button onClick={close}>
                  <Check className="w-3.5 h-3.5" /> Got it
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Step components ──────────────────────────────────────────────────────── */

function StepWelcome({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center text-center"
    >
      <div className="mt-2 mb-3">
        <Wordmark size={36} />
      </div>
      <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mb-2">
        Step 1 of 5 · Welcome
      </div>
      <h2 id="onboarding-title" className="text-[24px] font-semibold tracking-tight text-forge-text mb-3">
        Hi, this is Forge.
      </h2>
      <p className="text-[15px] text-forge-text/85 leading-relaxed max-w-md mb-5">
        Forge processes images, videos, and audio in bulk — locally, on your computer.
        It does five things and we'll show you each one in 60 seconds.
      </p>
      <button
        onClick={onContinue}
        className="group relative w-full max-w-md rounded-xl border border-forge-primary/30 bg-primary-gradient-soft py-5 px-6 transition-all hover:border-forge-primary/60 hover:bg-primary-gradient-soft/80"
      >
        <div className="flex items-center justify-center gap-3 text-forge-text">
          <MousePointer2 className="w-4 h-4 text-forge-primaryHi group-hover:translate-y-0.5 transition-transform" />
          <span className="text-[14px] font-semibold">Click here to start the tour</span>
        </div>
        <div className="text-[11px] text-forge-text/55 mt-1.5">
          Or hit "Let's go" below — same thing.
        </div>
      </button>
    </motion.div>
  );
}

function StepDropFile({ acted, onPracticed }: { acted: boolean; onPracticed: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center text-center"
    >
      <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mb-2">
        Step 2 of 5 · Drag and drop
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-forge-text mb-2">
        Forge takes files by drag-and-drop.
      </h2>
      <p className="text-[14px] text-forge-text/80 leading-relaxed max-w-md mb-5">
        Open Finder. Find any image or video. Drag it onto this window — anywhere
        is fine. We'll detect it.
      </p>

      {/* Animated drop target visualization */}
      <motion.div
        animate={
          acted
            ? { scale: 1.0, borderColor: 'rgba(16,185,129,0.6)' }
            : { borderColor: ['rgba(79,142,255,0.4)', 'rgba(167,139,250,0.7)', 'rgba(79,142,255,0.4)'] }
        }
        transition={
          acted ? { duration: 0.3 } : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
        }
        className="w-full max-w-md rounded-xl border-2 border-dashed py-8 px-6 flex flex-col items-center"
      >
        {acted ? (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400 }}
              className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mb-3"
            >
              <Check className="w-6 h-6 text-emerald-300" />
            </motion.div>
            <div className="text-[14px] font-semibold text-emerald-300">Got it!</div>
            <div className="text-[12px] text-forge-text/65 mt-1">
              Hit Continue below to see the tools.
            </div>
          </>
        ) : (
          <>
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="w-12 h-12 rounded-2xl bg-primary-gradient flex items-center justify-center mb-3 shadow-primarySoft"
            >
              <Upload className="w-5 h-5 text-white" />
            </motion.div>
            <div className="text-[14px] font-semibold text-forge-text">Drop files here</div>
            <div className="text-[11px] text-forge-text/55 mt-1.5">
              From Finder · Desktop · anywhere
            </div>
          </>
        )}
      </motion.div>

      {!acted && (
        <button
          onClick={onPracticed}
          className="text-[11px] text-forge-mute hover:text-forge-primaryHi transition-colors mt-4 underline-offset-2 hover:underline"
        >
          I'll skip this — I've used drag-and-drop before
        </button>
      )}
    </motion.div>
  );
}

function StepTabsTour() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center text-center"
    >
      <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mb-2">
        Step 3 of 5 · The four tabs
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-forge-text mb-2">
        Forge has five tools.
      </h2>
      <p className="text-[14px] text-forge-text/80 leading-relaxed max-w-md mb-5">
        Each tool is a tab at the top of the window. They do related but different things.
      </p>

      <div className="space-y-2.5 w-full max-w-md text-left">
        {TOOLS.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.25 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.025] border border-white/[0.06]"
          >
            <div className="w-9 h-9 rounded-lg bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center shrink-0">
              <t.icon className="w-4 h-4 text-forge-primaryHi" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-forge-text">{t.title}</div>
              <div className="text-[12px] text-forge-text/65 leading-relaxed">{t.desc}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function StepPickTool({ onPick }: { onPick: (t: ToolId) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center text-center"
    >
      <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mb-2">
        Step 4 of 5 · Pick where to start
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-forge-text mb-2">
        Which tool do you need first?
      </h2>
      <p className="text-[13.5px] text-forge-text/75 leading-relaxed max-w-md mb-5">
        Click one and we'll close the tour and take you straight there. You can switch tools any time from the tabs.
      </p>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {TOOLS.map((t) => (
          <motion.button
            key={t.id}
            whileHover={{ y: -2, transition: { type: 'spring', stiffness: 400 } }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(t.id)}
            className="group relative p-4 rounded-xl bg-white/[0.025] border border-white/[0.07] text-left hover:border-forge-primary/50 hover:bg-primary-gradient-soft transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center mb-2.5 group-hover:bg-primary-gradient group-hover:border-transparent transition-colors">
              <t.icon className="w-5 h-5 text-forge-primaryHi group-hover:text-white" />
            </div>
            <div className="text-[13px] font-semibold text-forge-text">{t.title}</div>
            <div className="text-[11.5px] text-forge-text/60 mt-1 leading-relaxed">{t.desc}</div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

function StepHelp() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center text-center"
    >
      <div className="text-[10px] uppercase tracking-wider3 text-forge-primaryHi font-semibold mb-2">
        Step 5 of 5 · Help is one click away
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-forge-text mb-2">
        Stuck later? Top-right of the window.
      </h2>
      <p className="text-[13.5px] text-forge-text/75 leading-relaxed max-w-md mb-5">
        These three icons are always there:
      </p>

      <div className="space-y-2.5 w-full max-w-md text-left">
        <HelpRow
          icon={<HelpCircle className="w-4 h-4" />}
          title="Tour (this thing)"
          body="Re-opens this onboarding from the start."
        />
        <HelpRow
          icon={<BookOpen className="w-4 h-4" />}
          title="Manual"
          body="Full feature reference — every option explained, in plain English."
        />
        <HelpRow
          icon={<Bot className="w-4 h-4" />}
          title="AI assistant"
          body="Chat with an assistant that knows Forge inside out. Bring your own OpenAI API key."
        />
      </div>

      <p className="text-[12px] text-forge-text/55 leading-relaxed max-w-md mt-5">
        Hit <span className="text-forge-text font-semibold">Got it</span> below and you're done.
        Drop files anywhere on the window to get started.
      </p>
    </motion.div>
  );
}

function HelpRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.025] border border-white/[0.06]">
      <div className="w-9 h-9 rounded-lg bg-primary-gradient-soft border border-forge-primary/30 flex items-center justify-center text-forge-primaryHi shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-forge-text">{title}</div>
        <div className="text-[12px] text-forge-text/65 leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

function Dots({ step, total, onJump }: { step: number; total: number; onJump: (i: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onJump(i)}
          className={`h-1.5 rounded-full transition-all ${
            i === step ? 'w-6 bg-forge-primary' : 'w-1.5 bg-white/15 hover:bg-white/30'
          }`}
          aria-label={`Go to step ${i + 1}`}
        />
      ))}
    </div>
  );
}

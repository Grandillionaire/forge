import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Minimize2, Wand2, FileVideo2 } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ImageUpscaleView } from './components/ImageUpscaleView';
import { ImageCompressView } from './components/ImageCompressView';
import { VideoUpscaleView } from './components/VideoUpscaleView';
import { VideoCompressView } from './components/VideoCompressView';
import { DragOverlay } from './components/DragOverlay';
import { OnboardingWizard } from './components/OnboardingWizard';

type Tab = 'image-upscale' | 'image-compress' | 'video-upscale' | 'video-compress';

const TABS: Array<{ id: Tab; label: string; shortLabel: string; icon: React.ReactNode }> = [
  { id: 'image-upscale',  label: 'Image upscale',  shortLabel: 'Img upscale',  icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'image-compress', label: 'Image compress', shortLabel: 'Img compress', icon: <Minimize2 className="w-3.5 h-3.5" /> },
  { id: 'video-upscale',  label: 'Video upscale',  shortLabel: 'Vid upscale',  icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: 'video-compress', label: 'Video compress', shortLabel: 'Vid compress', icon: <FileVideo2 className="w-3.5 h-3.5" /> },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('image-upscale');
  const [ai, setAi] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installStage, setInstallStage] = useState('');
  // Onboarding wizard. Shows automatically on first launch (decides via localStorage).
  // Setting forceOpen = true via the (?) icon in the Header re-opens it on demand.
  const [tourForceOpen, setTourForceOpen] = useState(false);

  useEffect(() => {
    window.forge.diagnostics().then((d) => setAi(d.realesrganAvailable));
    const off = window.forge.onProgress((e) => {
      if (e.itemId === 'realesrgan') setInstallStage(e.stage);
    });
    return () => {
      off();
    };
  }, []);

  const installAi = async () => {
    setInstalling(true);
    setInstallStage('Starting…');
    const r = await window.forge.ensureRealesrgan();
    setInstalling(false);
    if (r.ok) {
      setAi(true);
      setInstallStage('Installed');
    } else {
      setInstallStage(r.message ?? 'Install failed');
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <DragOverlay />
      <OnboardingWizard
        forceOpen={tourForceOpen}
        onClose={() => setTourForceOpen(false)}
      />
      <Header
        aiAvailable={ai}
        installing={installing}
        onShowTour={() => setTourForceOpen(true)}
      />

      <nav className="px-4 sm:px-6 mt-2">
        <div className="max-w-6xl mx-auto flex items-center gap-1 glass-deep rounded-xl p-1">
          {TABS.map((t) => (
            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              <span className="flex items-center gap-2 justify-center">
                {t.icon}
                <span className="hidden sm:hidden lg:inline">{t.label}</span>
                <span className="hidden sm:inline lg:hidden">{t.shortLabel}</span>
              </span>
            </TabButton>
          ))}
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 pt-5 pb-8">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'image-upscale' && (
                <ImageUpscaleView
                  realesrganAvailable={ai}
                  onInstallRealesrgan={installAi}
                  installing={installing}
                  installStage={installStage}
                />
              )}
              {tab === 'image-compress' && <ImageCompressView />}
              {tab === 'video-upscale' && (
                <VideoUpscaleView
                  realesrganAvailable={ai}
                  onInstallRealesrgan={installAi}
                  installing={installing}
                  installStage={installStage}
                />
              )}
              {tab === 'video-compress' && <VideoCompressView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="tab-button relative flex-1"
    >
      {active && (
        <motion.span
          layoutId="tab-indicator"
          className="absolute inset-0 rounded-md bg-primary-gradient-soft border border-forge-primary/30 shadow-primarySoft"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

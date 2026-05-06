import { Cpu, Download, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';

interface Props {
  installing: boolean;
  installStage: string;
  onInstall: () => void;
  required?: boolean;
}

export function AiInstallBanner({ installing, installStage, onInstall, required }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative glass-strong rounded-2xl p-4 flex items-center gap-4 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 100% at 0% 50%, rgba(79,142,255,0.18) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-primary-gradient-soft border border-forge-primary/30 shrink-0">
        <Zap className="w-5 h-5 text-forge-primary" />
      </div>
      <div className="relative flex-1 min-w-0">
        <div className="text-[12px] uppercase tracking-wider2 text-forge-primary font-bold flex items-center gap-2">
          <span>Install AI engine</span>
          {required && <span className="pill pill-primary">Required</span>}
        </div>
        <div className="text-[12px] text-forge-text/70 mt-1 leading-relaxed">
          One-time ~50&nbsp;MB download. Runs locally on your GPU via Vulkan.
          {installing && (
            <span className="text-forge-primaryHi font-bold ml-2">
              {installStage || 'Working…'}
            </span>
          )}
        </div>
      </div>
      <div className="relative">
        <Button
          onClick={onInstall}
          disabled={installing}
          icon={<Download />}
        >
          {installing ? 'Installing' : 'Install'}
        </Button>
      </div>
    </motion.div>
  );
}

export function AiBadge({ on, fallbackLabel }: { on: boolean; fallbackLabel: string }) {
  return on ? (
    <div className="flex items-center gap-2 text-[11px]">
      <Zap className="w-3 h-3 text-forge-primary" />
      <span className="text-forge-primary font-bold">Real-ESRGAN active</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-[11px] text-forge-text/55">
      <Cpu className="w-3 h-3" />
      <span>{fallbackLabel}</span>
    </div>
  );
}

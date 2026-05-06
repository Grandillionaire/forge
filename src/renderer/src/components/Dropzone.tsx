import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, ImagePlus, Film } from 'lucide-react';

interface Props {
  kind: 'image' | 'video';
  onFiles: (paths: string[]) => void;
  hint?: string;
  compact?: boolean;
}

export function Dropzone({ kind, onFiles, hint, compact }: Props) {
  const [over, setOver] = useState(false);

  const handleDrop = useCallback(
    (ev: React.DragEvent) => {
      ev.preventDefault();
      setOver(false);
      const paths: string[] = [];
      for (const f of Array.from(ev.dataTransfer.files)) {
        const p = window.forge.getPathForFile(f);
        if (p) paths.push(p);
      }
      if (paths.length) onFiles(paths);
    },
    [onFiles],
  );

  const handlePick = async () => {
    const paths = await window.forge.pickFiles(kind);
    if (paths.length) onFiles(paths);
  };

  const Icon = kind === 'image' ? ImagePlus : Film;

  return (
    <motion.div
      onDragEnter={(e: React.DragEvent) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e: React.DragEvent) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={handlePick}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      className={`
        relative cursor-pointer rounded-2xl overflow-hidden
        ${compact ? 'py-7' : 'py-12'}
        px-6 text-center
        glass transition-all duration-300
        ${over ? 'shadow-primaryGlow' : ''}
      `}
      style={{
        backgroundImage: over
          ? 'radial-gradient(60% 100% at 50% 0%, rgba(79,142,255,0.20) 0%, transparent 70%)'
          : 'radial-gradient(60% 100% at 50% 0%, rgba(79,142,255,0.06) 0%, transparent 70%)',
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`
          relative flex items-center justify-center w-14 h-14 rounded-2xl
          glass-strong transition-all
          ${over ? 'bg-forge-primary/15 border-forge-primary/40' : ''}
        `}>
          <Icon className={`w-6 h-6 ${over ? 'text-forge-primaryHi' : 'text-forge-primary'}`} />
          {!over && (
            <span className="absolute -inset-1 rounded-2xl border border-forge-primary/20 animate-bloom pointer-events-none" />
          )}
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider3 text-forge-primary font-bold">
            {kind === 'image' ? 'Drop images' : 'Drop videos'}
          </div>
          <div className="text-[13px] text-forge-text/65">
            {hint ?? 'or click to choose files. Bulk supported.'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider2 text-forge-text/35 mt-1">
          <Upload className="w-3 h-3" />
          <span>Click anywhere · Drag from Finder</span>
        </div>
      </div>
    </motion.div>
  );
}

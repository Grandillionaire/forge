import { useEffect, useState } from 'react';
import { BookOpen, Bot, Cpu, HelpCircle, Zap } from 'lucide-react';
import { Wordmark } from './Wordmark';
import { StatusDot } from './ui/StatusDot';
import { GithubMark } from './icons/GithubMark';

interface Props {
  aiAvailable: boolean;
  installing: boolean;
  onShowTour: () => void;
  onShowManual: () => void;
  onShowAssistant: () => void;
}

const REPO_URL = 'https://github.com/Grandillionaire/forge';

/**
 * Top frame: wordmark + diagnostics strip. The drag region is the whole header
 * so users can move the window from any blank area; interactive elements get
 * `WebkitAppRegion: 'no-drag'` to remain clickable.
 */
export function Header({
  aiAvailable,
  installing,
  onShowTour,
  onShowManual,
  onShowAssistant,
}: Props) {
  const [diag, setDiag] = useState<{ cpuCount: number; arch: string } | null>(null);

  useEffect(() => {
    window.forge.diagnostics().then((d) => setDiag({ cpuCount: d.cpuCount, arch: d.arch }));
  }, []);

  const aiTone = installing ? 'busy' : aiAvailable ? 'ok' : 'warn';
  const aiText = installing
    ? 'Installing AI engine'
    : aiAvailable
    ? 'AI engine ready'
    : 'AI engine not installed';

  return (
    <header
      className="relative isolate select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-6 pt-5 pb-4 flex items-center gap-4">
        {/* macOS reserves ~78px of the title bar for traffic-light buttons */}
        <div className="w-[68px] sm:w-[78px] shrink-0" />
        <Wordmark size={22} />
        <div className="hidden sm:block w-px h-5 bg-white/10" />
        <span className="hidden sm:inline text-[12px] text-forge-mute leading-relaxed">
          Bulk media tooling — upscale, compress, transform.
        </span>
        <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={onShowAssistant}
            className="btn-icon"
            title="AI assistant"
            aria-label="Open AI assistant"
          >
            <Bot className="w-4 h-4" />
          </button>
          <button
            onClick={onShowManual}
            className="btn-icon"
            title="Open manual"
            aria-label="Open user manual"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={onShowTour}
            className="btn-icon"
            title="Show tour"
            aria-label="Show product tour"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              window.forge.openExternal(REPO_URL);
            }}
            className="btn-icon"
            title="View on GitHub"
            aria-label="GitHub repository"
          >
            <GithubMark className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Diagnostics strip */}
      <div className="px-6 pb-4">
        <div className="glass-deep rounded-xl mx-auto max-w-6xl flex items-center flex-wrap gap-x-5 gap-y-1.5 px-4 py-2 min-h-11">
          <DiagItem
            tone={aiTone}
            icon={<Zap className="w-3.5 h-3.5" />}
            label={aiText}
          />
          {diag && (
            <>
              <div className="w-px h-4 bg-white/10 hidden sm:block" />
              <DiagItem
                tone="idle"
                icon={<Cpu className="w-3.5 h-3.5" />}
                label={`${diag.cpuCount} cores · ${diag.arch}`}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function DiagItem({
  tone,
  icon,
  label,
}: {
  tone: 'ok' | 'warn' | 'idle' | 'busy';
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <StatusDot tone={tone} />
      <span className="text-forge-mute">{icon}</span>
      <span className="text-forge-text/85">{label}</span>
    </div>
  );
}

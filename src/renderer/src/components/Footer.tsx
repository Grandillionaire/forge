import { Heart } from 'lucide-react';
import { GithubMark } from './icons/GithubMark';

const REPO_URL = 'https://github.com/Grandillionaire/forge';

/**
 * Footer: minimal, MIT-licensed, with a link back to the source.
 * Replaces the long EULA the previous brand required.
 */
export function Footer() {
  return (
    <footer className="relative">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(79,142,255,0.35) 50%, transparent 100%)',
        }}
      />
      <div className="text-[10.5px] leading-relaxed flex items-center justify-center gap-3 text-forge-mute px-6 py-3 glass-deep">
        <span>Forge · MIT licensed</span>
        <span className="text-white/15">·</span>
        <button
          onClick={() => window.forge.openExternal(REPO_URL)}
          className="inline-flex items-center gap-1.5 hover:text-forge-primaryHi transition-colors"
        >
          <GithubMark className="w-3 h-3" />
          <span>github.com/Grandillionaire/forge</span>
        </button>
        <span className="text-white/15 hidden sm:inline">·</span>
        <span className="hidden sm:inline-flex items-center gap-1">
          built with <Heart className="w-3 h-3 text-forge-primary" /> for fast bulk media work
        </span>
      </div>
    </footer>
  );
}

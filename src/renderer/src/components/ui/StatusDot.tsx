import clsx from 'clsx';

type Tone = 'ok' | 'warn' | 'idle' | 'busy';

const dot: Record<Tone, { bg: string; ring: string; pulse: boolean }> = {
  ok:   { bg: 'bg-emerald-400',  ring: 'ring-emerald-400/40',  pulse: false },
  warn: { bg: 'bg-forge-accent2', ring: 'ring-forge-accent/40', pulse: true  },
  idle: { bg: 'bg-white/30',     ring: 'ring-white/10',         pulse: false },
  busy: { bg: 'bg-forge-primary',  ring: 'ring-forge-primary/40',   pulse: true  },
};

export function StatusDot({ tone = 'idle' }: { tone?: Tone }) {
  const c = dot[tone];
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className={clsx('absolute inset-0 rounded-full ring-4 ring-offset-0', c.bg, c.ring)} />
      {c.pulse && (
        <span className={clsx('absolute inset-0 rounded-full animate-pulseDot', c.bg)} />
      )}
    </span>
  );
}

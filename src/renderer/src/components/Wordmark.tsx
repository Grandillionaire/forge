/**
 * Forge wordmark — geometric "F" mark + lowercase wordmark in the renderer.
 * No raster asset; rendered inline so it scales crisply at any DPR.
 */
export function Wordmark({ size = 22 }: { size?: number }) {
  const h = size;
  return (
    <div className="inline-flex items-center gap-2.5 select-none" style={{ height: h }}>
      <svg
        width={h}
        height={h}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="forge-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4F8EFF" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        {/* Stem + crossbars: a stylized F with an angled cut suggesting an anvil */}
        <path
          d="M 18 12 L 50 12 L 50 22 L 28 22 L 28 32 L 44 32 L 44 42 L 28 42 L 28 56 L 18 56 Z"
          fill="url(#forge-mark)"
        />
        <path d="M 28 50 L 36 50 L 28 58 Z" fill="#0A0B0D" />
      </svg>
      <span
        className="font-semibold tracking-tight text-forge-text"
        style={{ fontSize: h * 0.7 }}
      >
        forge
      </span>
    </div>
  );
}

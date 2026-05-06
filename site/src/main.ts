/**
 * Forge — landing page.
 *
 * Detects the visitor's OS and architecture, resolves the correct asset URL
 * from the latest GitHub Release, and renders an OS-aware download CTA. Falls
 * back to the Releases page if the API doesn't return assets (no release yet,
 * rate limit, network error).
 *
 * On phones we still render the full marketing page but flip the primary CTA
 * to "View on GitHub" since you can't run a desktop binary on iOS/Android.
 */

const REPO = 'Grandillionaire/forge';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const REPO_PAGE = `https://github.com/${REPO}`;

interface PlatformGuess {
  os: 'mac' | 'win' | 'linux' | 'mobile';
  arch: 'arm64' | 'x64';
  label: string;
}

function detectPlatform(): PlatformGuess {
  const ua = navigator.userAgent;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData
      ?.platform ?? navigator.platform;

  // Phones / tablets first — they don't have a desktop installer.
  if (/iPhone|iPad|iPod|Android/i.test(ua)) {
    return { os: 'mobile', arch: 'arm64', label: 'Mobile' };
  }

  const isMac = /Mac/i.test(platform) || /Mac OS/i.test(ua);
  const isWin = /Win/i.test(platform);
  const isLinux = /Linux|X11/i.test(platform);

  // Apple Silicon detection is fuzzy because UA still says Intel for compat.
  // Default Macs to arm64; users on Intel can use the explicit "Intel Mac" link.
  let arch: 'arm64' | 'x64' = 'x64';
  if (isMac) arch = 'arm64';
  if (isWin && /ARM/i.test(ua)) arch = 'arm64';

  if (isMac) return { os: 'mac', arch, label: arch === 'arm64' ? 'Apple Silicon' : 'Intel Mac' };
  if (isWin) return { os: 'win', arch, label: arch === 'arm64' ? 'ARM64' : 'x64' };
  if (isLinux) return { os: 'linux', arch, label: arch === 'arm64' ? 'ARM64' : 'x64' };
  return { os: 'mac', arch: 'arm64', label: 'Apple Silicon' };
}

interface ReleaseAsset { name: string; browser_download_url: string; size: number }
interface ReleaseInfo { tag_name: string; assets: ReleaseAsset[] }

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return null;
    return (await r.json()) as ReleaseInfo;
  } catch {
    return null;
  }
}

function pickAssetForPlatform(release: ReleaseInfo, p: PlatformGuess): ReleaseAsset | null {
  if (p.os === 'mobile') return null;
  const wanted = release.assets.filter((a) => {
    const n = a.name.toLowerCase();
    if (p.os === 'mac') return n.endsWith('.dmg') && n.includes(p.arch);
    if (p.os === 'win') return n.endsWith('.exe') && n.includes(p.arch);
    if (p.os === 'linux') return n.endsWith('.appimage') && n.includes(p.arch);
    return false;
  });
  if (wanted.length) return wanted[0];

  const looser = release.assets.find((a) => {
    const n = a.name.toLowerCase();
    if (p.os === 'mac') return n.endsWith('.dmg');
    if (p.os === 'win') return n.endsWith('.exe');
    if (p.os === 'linux') return n.endsWith('.appimage');
    return false;
  });
  return looser ?? null;
}

const FEATURES = [
  {
    icon: 'sparkles',
    title: 'Bulk image upscaling',
    body: 'Real-ESRGAN running on your local GPU via Vulkan/Metal. Up to 4× resolution. Drop a folder, walk away.',
  },
  {
    icon: 'minimize',
    title: 'Compress & rewrite metadata',
    body: 'JPEG / WebP / AVIF re-encode at any quality, optional resize. Strip EXIF, GPS, ICC — or rewrite Artist, Copyright, Description across the whole batch.',
  },
  {
    icon: 'wand',
    title: 'Bulk video upscaling',
    body: 'Frame-by-frame AI upscale with audio preserved. Outputs H.264 with faststart. MP4, MOV, MKV, WebM all supported.',
  },
];

const ICONS: Record<string, string> = {
  sparkles:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  minimize:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  wand:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="m17.8 6.2 1.2-1.2"/><path d="m3 21 9-9"/><path d="m12.2 6.2-1.2-1.2"/></svg>',
  download:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  github:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.4-1.34-1.77-1.34-1.77-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0z"/></svg>',
  brand:
    '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="lm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4F8EFF"/><stop offset="100%" stop-color="#A78BFA"/></linearGradient></defs><path d="M 18 12 L 50 12 L 50 22 L 28 22 L 28 32 L 44 32 L 44 42 L 28 42 L 28 56 L 18 56 Z" fill="url(#lm)"/><path d="M 28 50 L 36 50 L 28 58 Z" fill="#0A0B0D"/></svg>',
};

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

function labelFor(os: PlatformGuess['os']): string {
  if (os === 'mac') return 'macOS';
  if (os === 'win') return 'Windows';
  if (os === 'linux') return 'Linux';
  return '';
}

function altsFor(release: ReleaseInfo, current: PlatformGuess): Array<{ url: string; label: string }> {
  const others: Array<{ url: string; label: string }> = [];
  for (const a of release.assets) {
    const n = a.name.toLowerCase();
    if (n.endsWith('.dmg') && current.os !== 'mac') {
      const arch = n.includes('arm64') ? 'arm64' : 'x64';
      others.push({ url: a.browser_download_url, label: `Mac ${arch}` });
    } else if (n.endsWith('.exe') && current.os !== 'win') {
      const arch = n.includes('arm64') ? 'arm64' : 'x64';
      others.push({ url: a.browser_download_url, label: `Windows ${arch}` });
    } else if (n.endsWith('.appimage') && current.os !== 'linux') {
      others.push({ url: a.browser_download_url, label: 'Linux' });
    } else if (current.os === 'mac' && n.endsWith('.dmg')) {
      const isArm = n.includes('arm64');
      const wantOther = current.arch === 'arm64' ? !isArm : isArm;
      if (wantOther) others.push({ url: a.browser_download_url, label: isArm ? 'Mac arm64' : 'Intel Mac' });
    }
  }
  const seen = new Set<string>();
  return others.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)));
}

async function render(): Promise<void> {
  const root = document.getElementById('app')!;
  const platform = detectPlatform();

  const featuresHtml = FEATURES.map((f) => `
    <article class="feature">
      <span class="icon">${ICONS[f.icon]}</span>
      <h3>${f.title}</h3>
      <p>${f.body}</p>
    </article>
  `).join('');

  const release = await fetchLatestRelease();
  const asset = release ? pickAssetForPlatform(release, platform) : null;

  // Mobile = no installer. Send them to GitHub instead.
  const isMobile = platform.os === 'mobile';
  const primaryHref = isMobile ? REPO_PAGE : asset?.browser_download_url ?? RELEASES_PAGE;
  const primaryLabel = isMobile
    ? 'View on GitHub'
    : asset
    ? `Download for ${labelFor(platform.os)} · ${platform.label}`
    : 'View Releases';
  const primaryIcon = isMobile ? ICONS.github : ICONS.download;

  const sizeNote = !isMobile && asset ? bytes(asset.size) : '';
  const versionTag = release?.tag_name ?? '';
  const altLinks = !isMobile && release
    ? altsFor(release, platform).map((a) => `<a href="${a.url}" download>${a.label}</a>`).join('<span class="dot">·</span>')
    : '';

  root.innerHTML = `
    <div class="topbar">
      <a class="brand" href="/">
        <span class="mark">${ICONS.brand}</span>
        <span class="name">forge</span>
      </a>
      <nav>
        <a href="${REPO_PAGE}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>GitHub</span></a>
      </nav>
    </div>

    <main>
      <section class="container hero">
        <span class="eyebrow">Open source · MIT licensed</span>
        <h1>Bulk media work, <span class="accent">on your own GPU.</span></h1>
        <p class="lede">
          AI image upscaling, batch compression with metadata control, and AI video
          upscaling — all running locally. No uploads, no accounts, no per-use cost.
        </p>
        <div class="actions">
          <a class="btn btn-primary" href="${primaryHref}" ${isMobile ? 'target="_blank" rel="noopener noreferrer"' : 'download'}>
            ${primaryIcon}
            <span>${primaryLabel}</span>
          </a>
          ${!isMobile ? `<a class="btn btn-ghost" href="${RELEASES_PAGE}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>All releases</span></a>` : ''}
        </div>
        <div class="platform-row">
          ${versionTag ? `<span>${versionTag}</span>` : ''}
          ${versionTag && sizeNote ? '<span class="dot">·</span>' : ''}
          ${sizeNote ? `<span>${sizeNote}</span>` : ''}
          ${altLinks ? `${(versionTag || sizeNote) ? '<span class="dot">·</span>' : ''}${altLinks}` : ''}
        </div>
        ${isMobile ? `
          <div class="mobile-notice" style="display: block">
            Forge is a <b>desktop app</b> — open this page on your Mac, Windows, or Linux machine to download.
          </div>` : ''}
      </section>

      <section class="container">
        <div class="feature-grid">${featuresHtml}</div>
      </section>

      <section class="container install">
        <h2>How to install</h2>
        <div class="steps">
          <div class="step"><div class="num">01</div><h4>Download</h4>
            <p>Click the button above. Your platform is auto-detected.</p>
          </div>
          <div class="step"><div class="num">02</div><h4>Open the installer</h4>
            <p>Mac: open the <code class="kbd">.dmg</code>, drag into <code class="kbd">Applications</code>. Windows: run the <code class="kbd">.exe</code>.</p>
          </div>
          <div class="step"><div class="num">03</div><h4>First launch (Mac)</h4>
            <p>If you see <em>"Forge is damaged"</em> — that's a misleading macOS warning for unsigned apps. Run this once in Terminal: <code class="kbd">xattr -dr com.apple.quarantine /Applications/Forge.app</code></p>
          </div>
          <div class="step"><div class="num">04</div><h4>Auto-updates</h4>
            <p>Forge checks GitHub for new versions on launch and updates itself in the background.</p>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <div class="links">
        <a href="${REPO_PAGE}" target="_blank" rel="noopener noreferrer">${ICONS.github}<span>Source</span></a>
        <a href="${REPO_PAGE}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
        <a href="${REPO_PAGE}/issues" target="_blank" rel="noopener noreferrer">Issues</a>
      </div>
      <div style="margin-top: 14px; opacity: 0.6;">© Forge contributors</div>
    </footer>
  `;
}

void render();

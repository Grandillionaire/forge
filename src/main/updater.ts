import { dialog, BrowserWindow, app } from 'electron';
import pkg from 'electron-updater';
import log from 'electron-log/main';

// CommonJS-style import — electron-updater ships dual ESM/CJS but the named
// exports trip Vite's externalizer when imported directly.
const { autoUpdater } = pkg;

/**
 * Auto-update flow:
 *   1. Production builds only (skip in dev so the dev loop isn't poisoned).
 *   2. Check on launch and every 6h while the app is open.
 *   3. Download in background, then prompt user to install on next quit.
 *
 * Update channel is wired to GitHub Releases via electron-builder.yml `publish`
 * config — autoUpdater reads `app-update.yml` baked into the release at build time.
 */
export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.info('[updater] dev build — skipping auto-update');
    return;
  }

  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log.info('[updater] checking…'));
  autoUpdater.on('update-available', (info) => log.info('[updater] available:', info.version));
  autoUpdater.on('update-not-available', () => log.info('[updater] up to date'));
  autoUpdater.on('error', (err) => log.error('[updater] error:', err));
  autoUpdater.on('download-progress', (p) =>
    log.info(`[updater] downloading: ${p.percent.toFixed(1)}%`),
  );

  autoUpdater.on('update-downloaded', async (info) => {
    log.info('[updater] downloaded:', info.version);
    const win = getMainWindow();
    if (!win) return;
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Forge ${info.version} is ready.`,
      detail: 'Restart to install. The update is already downloaded.',
    });
    if (r.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // Initial check 5s after launch (let the window settle), then every 6h.
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch((e) => log.error(e)), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch((e) => log.error(e)), 6 * 60 * 60 * 1000);
}

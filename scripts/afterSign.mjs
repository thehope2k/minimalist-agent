// electron-builder afterSign hook (mac only).
//
// With `identity: null` in electron-builder.yml, electron-builder skips its
// own signing step entirely, leaving the app bundle carrying whatever
// ad-hoc signature the prebuilt Electron binary shipped with — identified
// as "Electron", not our bundle ID, and not resealed to cover the resources
// electron-builder added (icon, Info.plist, out/**). That mismatch makes
// `spctl` report a broken signature and can prevent macOS from reliably
// attributing OS integrations (e.g. Notification Center) to this app.
//
// Re-sign ad-hoc (no paid cert needed) with the real identifier so the
// bundle is internally consistent. This does not satisfy Gatekeeper/
// notarization — `xattr -d com.apple.quarantine` (or right-click → Open)
// is still required on each fresh install.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const BUNDLE_ID = 'do.thehope.minimalist-agent';

export default async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign', '-',
    '--identifier', BUNDLE_ID,
    appPath,
  ]);
}

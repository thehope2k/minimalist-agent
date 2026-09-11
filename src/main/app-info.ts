// Small app-identity constants shared across main-process modules that need
// to identify the app to a remote server (export transports, etc).

import { app } from 'electron';

/** Reads the version from package.json at runtime so it stays in sync. */
export const APP_USER_AGENT = `MinimalistAgent/${app.getVersion()}`;

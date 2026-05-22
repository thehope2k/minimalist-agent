// Configure Monaco to use locally bundled workers instead of CDN.
// Must be imported before any Monaco or @monaco-editor/react usage.
//
// Only the base editor worker is registered. Language-specific workers
// (TypeScript, JSON, CSS) require proper file:// model URIs to activate
// semantic highlighting — the DiffEditor uses anonymous models so they
// provide no benefit and add bundle weight unnecessarily.
//
// Syntax highlighting quality comes from the theme token rules in
// GitDiffView.tsx (TextMate grammar scopes, VS Code Dark+ palette).

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

(self as unknown as Record<string, unknown>).MonacoEnvironment = {
  getWorker(_moduleId: string, _label: string) {
    return new editorWorker();
  },
};

loader.config({ monaco });

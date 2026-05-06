# Theme Engine — Tasks

## Phase: Implement

### Core infrastructure

- [x] T-001 Define `ThemeTokenSchema` type and JSON validator in `src/main/themes/types.ts`
- [x] T-002 Write `ThemeRegistry` class with `list()`, `install()`, `activate()`, `delete()` methods
- [x] T-003 Add IPC handlers: `theme:list`, `theme:install`, `theme:activate`, `theme:delete`
- [x] T-004 Expose handlers in preload `window.api.themes.*`
- [ ] T-005 Write `ThemeLoader` in renderer — applies token map to `:root` on startup
- [ ] T-006 Persist active theme id in `preferences.json`; reload on app start

### UI

- [ ] T-007 Add "Appearance" section to Settings with built-in theme swatches
- [ ] T-008 Implement live preview on swatch hover (revert on mouse-out)
- [ ] T-009 Add "Browse themes" sheet — fetches registry JSON, renders cards
- [ ] T-010 Community theme install flow — progress indicator + error state
- [ ] T-011 Theme editor panel — token list with color pickers
- [ ] T-012 Delete confirmation for custom themes

### Quality

- [ ] T-013 Unit tests for schema validator (valid / missing field / extra field)
- [ ] T-014 E2E: switch built-in theme → verify CSS var value on `:root`

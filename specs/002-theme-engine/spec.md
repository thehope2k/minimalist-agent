# Theme Engine

## Overview

Allow users to switch between built-in themes (dark, light, high-contrast) and install community themes from a registry. Themes are OKLCH-based token sets that override the base design tokens at runtime.

## User Journeys

### Journey 1 — Switching a built-in theme

**Given** a user opens Settings → Appearance  
**When** they click a theme swatch (e.g. "Light")  
**Then** the UI immediately re-renders with the new token set, no reload required

### Journey 2 — Installing a community theme

**Given** a user opens the Themes panel  
**When** they click "Browse themes" and select one from the registry  
**Then** it downloads, validates the token schema, and becomes available in the switcher

### Journey 3 — Editing a theme

**Given** a user has a custom theme installed  
**When** they open the theme editor and tweak `--accent`  
**Then** the change is previewed live and saved on confirm

## Acceptance Criteria

- [ ] Theme switching applies in < 100 ms (no full re-render of chat history)
- [ ] Invalid token schemas are rejected with a clear error message
- [ ] Built-in themes cannot be deleted
- [ ] Themes persist across app restarts via user-data storage
- [ ] Community themes are sandboxed (CSS variables only, no JS injection)

## Out of Scope

- Per-session themes (v1 is global only)
- Exporting themes as shareable files (post-v1)

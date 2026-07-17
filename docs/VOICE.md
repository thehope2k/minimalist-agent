# Voice dictation (Cmd+Shift+M)

**On-device speech-to-text for the message composer — talk instead of type.**

---

## Overview

Press the mic button (or **Cmd+Shift+M** / **Ctrl+Shift+M**) to dictate into
the composer. Speech is transcribed locally, in real time, and inserted at
the cursor — no audio or transcript ever leaves the machine.

**Use case:** faster message composition when typing is inconvenient, or
simply a preference for talking through a prompt before sending it.

---

## Features

- **Mic button + shortcut** — toggle recording from the composer or the keyboard
- **Streaming, not one-shot** — speech is transcribed in segments as you
  talk, so a long dictation doesn't make you wait until you stop recording
  to see any text appear
- **Insert-at-cursor** — each segment lands at the current cursor position
  with sensible spacing, not appended to the end of whatever's already typed
- **Works offline** — after a one-time model download on first use, no
  network access is needed for dictation ever again
- **English only**, for now

---

## Design decisions

### Why on-device instead of a cloud STT API?

Privacy and reliability: dictation should work the same on a plane as at a
desk, and audio content shouldn't have to leave the machine to become text
in a chat composer. The trade-off is model size/quality — an on-device model
is smaller and less accurate than a large cloud model, but "good enough for
composing a chat message" is the actual bar here, not "transcribe a podcast."

### Why streaming instead of record-then-transcribe?

Recording a whole dictation and transcribing it only once you stop feels
slow for anything longer than a sentence. Detecting speech boundaries as you
talk and transcribing each segment as it completes gets text into the
composer while you're still talking about the next part.

### Why one session at a time?

The current UI only ever has one composer with an active mic at once, so the
underlying speech pipeline is intentionally a single shared instance rather
than something that pools/queues multiple concurrent recordings. If a second
concurrent dictation surface is ever added, that pipeline needs to become
per-session rather than process-global — noted as a limitation, not a bug.

---

## Model download

The on-device model set (tens of MB) downloads once, the first time
dictation is used, with a progress indicator shown inline in the composer.
The download is checksum-verified before being considered ready, so a
truncated or corrupted fetch can't silently pass as "installed." Every
dictation after that first download runs fully offline.

---

## Privacy & permissions

- **Audio and transcripts never leave the machine.** Speech detection and
  transcription both run locally. The only network access this feature ever
  makes is the one-time model download above.
- **Microphone access is explicitly scoped** to the app's own window — it is
  not left to the platform's default (which would allow any content the app
  ever loads to request it).
- **macOS** requires an explicit usage-description string before any
  microphone API call is allowed at all — without it the OS terminates the
  request outright rather than just denying it, so this is a hard
  prerequisite for the feature to work on macOS builds, not an optional
  nicety.

---

## Known limitations

- English-only (current model is English-specific)
- One active dictation session at a time, app-wide — not per-session/tab
- No visual waveform or audio-level meter — just a recording indicator and
  status text

---

## Troubleshooting

**Mic button does nothing / no permission prompt appears** — the OS may
have denied microphone access previously; check the app's entry in System
Settings → Privacy & Security → Microphone (macOS) and re-enable it.

**"No speech detected" after stopping** — the voice-activity detector didn't
find any segment that crossed its speech threshold; try speaking sooner
after starting the recording and closer to the mic.

**Download stuck / fails** — the model is fetched from a public GitHub
release; a corporate proxy or firewall blocking `github.com` release assets
will prevent the first-time download from completing.

---

## For contributors

Implementation lives in `src/main/voice/` (model download/verification,
voice-activity detection, transcription) and
`src/renderer/src/components/chat/message-input/` (audio capture, streaming
resample, recording state machine). See
[ARCHITECTURE.md](./ARCHITECTURE.md#voice-dictation) for the module
boundaries and IPC surface.

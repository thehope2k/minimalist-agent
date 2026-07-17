# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Send a report to: **nguyenthehop2000@gmail.com**  
_(or use GitHub's [private vulnerability reporting](https://github.com/thehope2k/minimalist-agent/security/advisories/new) if enabled on the repo)_


Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected version(s)

You'll receive an acknowledgement within 48 hours and a resolution timeline as
soon as the scope is understood. We'll credit you in the release notes unless
you prefer to remain anonymous.

## Credential storage

API keys and OAuth tokens are stored encrypted via Electron's `safeStorage`
API, which delegates to the OS keychain (Keychain on macOS, Secret Service on
Linux, DPAPI on Windows). They are never written to disk in plaintext.

## Device permissions

Microphone access (voice dictation) is not left to Electron's permissive
default. It's explicitly scoped to the app's own window, so no other content
the app might ever load could request it. Voice audio is processed entirely
on-device and never leaves the machine — the only network access this
feature ever makes is a one-time model download on first use. See
[docs/VOICE.md](docs/VOICE.md).

## Scope

| In scope                           | Out of scope                                                        |
|------------------------------------|---------------------------------------------------------------------|
| Credential leakage or exfiltration | Issues in `node_modules` dependencies (report upstream)             |
| Privilege escalation via IPC       | UI cosmetic bugs                                                    |
| OAuth flow bypasses                | Agent tool outputs (the agent runs with your permissions by design) |

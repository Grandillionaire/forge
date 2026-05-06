# Security Policy

Forge is a desktop app that runs entirely on a user's machine, with one external network surface (GitHub, for auto-update and the Real-ESRGAN sidecar download). The threat model is small but not trivial — files the user opens are processed locally, and the app spawns native binaries on their behalf.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Use one of these private channels:

1. **GitHub Security Advisories** — preferred. Open one at:
   https://github.com/Grandillionaire/forge/security/advisories/new
2. **Direct contact** — through the maintainer's GitHub profile.

Expect an acknowledgement within **72 hours**. We'll discuss a fix and disclosure timeline privately, then coordinate a release.

## What's in scope

- Privilege escalation from the renderer to the main process (IPC validation gaps)
- Path traversal or arbitrary file access via crafted paths
- Code execution via `spawn`/`exec` arg injection
- Bypasses of the renderer sandbox / contextIsolation / CSP
- Auto-update channel hijacks
- Supply-chain issues in dependencies that materially affect Forge
- Anything that lets a malicious file (image / video) cause RCE

## What's out of scope

- Issues that require physical access or local admin privileges already
- Vulnerabilities in third-party tools we ship (Real-ESRGAN, FFmpeg, ExifTool) — please report those upstream first; we're happy to ship a patched version once the upstream fix lands
- Self-XSS via untrusted file metadata (we strip newlines from user input but don't claim immunity)
- The lack of code signing — that's a known cost-vs-benefit decision; PRs adding a CI signing setup are welcome

## Hardening already in place

- Renderer: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`
- CSP: `default-src 'self'`, no `unsafe-eval`, no remote scripts
- All IPC handlers validate input shape; paths must have a media extension; URLs in `openExternal` must be `http(s)://`
- All `spawn`/`exec` calls use array args (no shell)
- User-supplied metadata strings are stripped of newlines and clamped to 1024 chars before passing to ExifTool
- Network egress: GitHub only (auto-update + Real-ESRGAN download). No telemetry, no analytics, no third-party SDKs.

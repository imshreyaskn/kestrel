/**
 * The Content-Security-Policy meta tag injected into every sandboxed preview
 * document (margin plates and the plate viewer). Mirrors the server-side
 * CSP in `backend/app/security/sanitizer.py` — keep the two in sync.
 *
 * Policy: no scripts, no network, no forms, no frames, no plugins, no
 * top navigation. Images and fonts only as embedded data/blob; styles inline.
 */
export const CSP_HEADER = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; form-action 'none'; base-uri 'none'">`;

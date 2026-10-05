/**
 * Strudel sample manifests, pinned to one dough-samples commit. Drum samples
 * are addressed by index within a folder (`perc:24`), so the drum kit catalog
 * is only right for the manifest it was generated from; a moving branch could
 * reorder files under it. Bump this and rerun scripts/generate-drum-kits.mts
 * together.
 */
export const SAMPLE_SOURCES_BASE = 'https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/';

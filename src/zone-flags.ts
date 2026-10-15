/**
 * Prevents Angular change detection from running with certain Web Component callbacks.
 * Must load before zone.js (see polyfills.ts).
 */
// eslint-disable-next-line no-underscore-dangle
(window as unknown as Record<string, unknown>)['__Zone_disable_customElements'] = true;

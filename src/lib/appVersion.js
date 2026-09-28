/* global __APP_BUILD_ID__ */
// Build id baked into this bundle at build time (see vite.config.js). A `version.json`
// with the same id is emitted next to index.html; comparing the two tells a long-open
// tab that a newer build has been deployed. 'dev' in the dev server (never compared).
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

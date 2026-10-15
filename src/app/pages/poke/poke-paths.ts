/** Route of the map page. The app serves it at the root. */
export const POKE_PATH = '/';

/**
 * The selected town rides on a query param, not a path segment. Ionic's route reuse strategy
 * recreates the page whenever a path param changes, which would rebuild the Leaflet map on every
 * pick; query params leave the same page instance in place. `?town=<id>` still opens a town by URL.
 */
export const TOWN_PARAM = 'town';

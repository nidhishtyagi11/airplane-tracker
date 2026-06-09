export const APT = {
  lat: 28.497530680493732,
  lon: 77.43980135733617,
  elevFt: 179,
  heading: 302,
};

export const WINDOW_SECTORS = [
  { startRel: 45, endRel: 135 },
  { startRel: 225, endRel: 315 },
];

export const MAX_DISTANCE_KM = 10;
export const API_URL = 'https://api.airplanes.live/v2/point';
export const ROUTE_API_URL = 'https://api.adsbdb.com/v0/callsign';
export const SEARCH_RADIUS_NM = 15;
export const POLL_INTERVAL_MS = 3000;

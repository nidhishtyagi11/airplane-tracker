import { APT, API_URL, SEARCH_RADIUS_NM, ROUTE_API_URL } from './config.js';

export async function fetchNearbyAircraft() {
  const url = `${API_URL}/${APT.lat}/${APT.lon}/${SEARCH_RADIUS_NM}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.ac || []).filter(ac => ac.lat != null && ac.lon != null);
}

const routeCache = new Map();

export async function fetchRoute(callsign) {
  const cs = callsign.trim();
  if (!cs) return null;
  if (routeCache.has(cs)) return routeCache.get(cs);

  try {
    const res = await fetch(`${ROUTE_API_URL}/${cs}`);
    if (!res.ok) { routeCache.set(cs, null); return null; }
    const data = await res.json();
    const route = data?.response?.flightroute || null;
    routeCache.set(cs, route);
    return route;
  } catch {
    return null;
  }
}

import { fetchNearbyAircraft, fetchRoute } from './api.js';
import { bearingTo, elevationAngle, distanceKm, isInWindowSector } from './geo.js';
import { Renderer } from './renderer.js';
import { POLL_INTERVAL_MS, MAX_DISTANCE_KM, WINDOW_SECTORS } from './config.js';

const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas);
const routeData = new Map();

async function poll() {
  try {
    const aircraft = await fetchNearbyAircraft();

    for (const ac of aircraft) {
      ac._bearing = bearingTo(ac.lat, ac.lon);
      ac._elevation = elevationAngle(ac.lat, ac.lon, typeof ac.alt_baro === 'number' ? ac.alt_baro : 0);
      ac._distKm = distanceKm(ac.lat, ac.lon);
      ac._inSector = isInWindowSector(ac._bearing, WINDOW_SECTORS) && ac._distKm <= MAX_DISTANCE_KM;

      const cs = (ac.flight || '').trim();
      if (cs) {
        ac._route = routeData.get(cs) || null;
        if (!routeData.has(cs)) {
          routeData.set(cs, null);
          fetchRoute(cs).then(route => {
            if (route) routeData.set(cs, route);
          });
        }
      }
    }

    renderer.updateAircraft(aircraft);
  } catch {
    // network error — keep showing last known state
  }
}

function frame() {
  renderer.draw();
  requestAnimationFrame(frame);
}

poll();
setInterval(poll, POLL_INTERVAL_MS);
requestAnimationFrame(frame);

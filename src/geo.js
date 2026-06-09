import { APT } from './config.js';

const DEG = Math.PI / 180;
const FT_TO_M = 0.3048;

export function bearingTo(lat, lon) {
  const dLon = (lon - APT.lon) * DEG;
  const lat1 = APT.lat * DEG;
  const lat2 = lat * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

export function elevationAngle(lat, lon, altFt) {
  const R = 6371000;
  const dLat = (lat - APT.lat) * DEG;
  const dLon = (lon - APT.lon) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(APT.lat * DEG) * Math.cos(lat * DEG) * Math.sin(dLon / 2) ** 2;
  const groundDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const altDiff = (altFt - APT.elevFt) * FT_TO_M;
  return Math.atan2(altDiff, groundDist) / DEG;
}

export function distanceKm(lat, lon) {
  const R = 6371000;
  const dLat = (lat - APT.lat) * DEG;
  const dLon = (lon - APT.lon) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(APT.lat * DEG) * Math.cos(lat * DEG) * Math.sin(dLon / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return m / 1000;
}

export function relativeBearing(absoluteBearing) {
  let rel = (absoluteBearing - APT.heading + 360) % 360;
  return rel;
}

export function isInWindowSector(absoluteBearing, sectors) {
  const rel = relativeBearing(absoluteBearing);
  return sectors.some(s => rel >= s.startRel && rel <= s.endRel);
}

import { APT, MAX_DISTANCE_KM } from './config.js';
import { getAirline } from './airlines.js';

const FONT = "'Poppins', system-ui, -apple-system, sans-serif";
const ORANGE = [255, 140, 0];
const GREY = [100, 100, 100];

const ARROW_SHAPE = [[1, 0], [-0.6, -0.78], [-0.12, 0], [-0.6, 0.78]];
const ARROW_SIZE_ACTIVE = 52;
const ARROW_SIZE_BG = 32;
const HIT_RADIUS = 50;
const LERP_SPEED = 0.08;
const ANIM_SPEED = 3.5;
const MIN_OPACITY = 0.25;
const GREY_OPACITY = 0.08;

const TICKER_SPEED = 16;
const TICKER_ITEM_H = 56;
const TICKER_HEADING_H = 36;
const TICKER_W = 260;
const TICKER_LINE_W = 120;

// SVG icon paths (from Material Icons, viewBox 0 -960 960 960)
const ROUTE_SVG_D = 'm393-119-95-179-180-96 59-59 148 27 122-121-327-139 72-72 396 69 133-133q21-21 50.5-21t50.5 21q21 21 21 50.5T822-721L689-588l69 396-72 72-139-327-121 122 26 147-59 59Z';
const PROXIMITY_SVG_D = 'M140-240q-24 0-42-18t-18-42v-360q0-23 18-41.5t42-18.5h680q24 0 42 18.5t18 41.5v360q0 24-18 42t-42 18H140Zm0-60h680v-360H690v180h-60v-180H510v180h-60v-180H330v180h-60v-180H140v360Z';

let routePath = null;
let proximityPath = null;
try {
  routePath = new Path2D(ROUTE_SVG_D);
  proximityPath = new Path2D(PROXIMITY_SVG_D);
} catch { /* fallback below */ }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}
function rgba(c, a) { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
function lerpColor(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
function distOpacity(km) {
  return MIN_OPACITY + (1 - clamp(km / MAX_DISTANCE_KM, 0, 1)) * (1 - MIN_OPACITY);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function easeOut(t) { return 1 - (1 - t) * (1 - t); }

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function drawSvgIcon(ctx, path, x, y, size, fillStyle) {
  if (!path) return;
  ctx.save();
  ctx.translate(x, y);
  const s = size / 960;
  ctx.scale(s, s);
  ctx.translate(0, 960);
  ctx.fillStyle = fillStyle;
  ctx.fill(path);
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.arrows = new Map();
    this.selectedHex = null;
    this.hoveredHex = null;
    this.infoPanelOpacity = 0;
    this.lastTime = performance.now();
    this.dpr = 1;
    this.tickerItems = [];
    this.tickerScroll = 0;
    this.tickerVisibleItems = []; // for hit testing

    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('mousemove', e => {
      const mx = e.clientX * this.dpr;
      const my = e.clientY * this.dpr;
      const tickerHit = this.tickerHitTest(mx, my);
      if (tickerHit) {
        this.hoveredHex = tickerHit;
        canvas.style.cursor = 'pointer';
      } else {
        const arrowHit = this.arrowHitTest(mx, my);
        this.hoveredHex = arrowHit;
        canvas.style.cursor = arrowHit ? 'pointer' : 'none';
      }
    });
    canvas.addEventListener('click', e => {
      const mx = e.clientX * this.dpr;
      const my = e.clientY * this.dpr;
      const tickerHit = this.tickerHitTest(mx, my);
      const hit = tickerHit || this.arrowHitTest(mx, my);
      if (!hit) this.selectedHex = null;
      else this.selectedHex = hit === this.selectedHex ? null : hit;
    });
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
    this.cx = this.canvas.width / 2;
    this.cy = this.canvas.height / 2;
    this.maxRadius = Math.min(this.cx, this.cy) * 0.65;
  }

  arrowHitTest(mx, my) {
    let best = null, bestD = HIT_RADIUS * this.dpr;
    for (const [hex, a] of this.arrows) {
      const dx = mx - a.tipX, dy = my - a.tipY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = hex; }
    }
    return best;
  }

  tickerHitTest(mx, my) {
    for (const vi of this.tickerVisibleItems) {
      if (mx >= vi.left && mx <= vi.right && my >= vi.top && my <= vi.bottom) {
        return vi.hex;
      }
    }
    return null;
  }

  // ── Data update ──────────────────────────
  updateAircraft(list) {
    const now = Date.now();
    const active = new Set();

    for (const ac of list) {
      active.add(ac.hex);
      if (!this.arrows.has(ac.hex)) {
        this.arrows.set(ac.hex, {
          bearing: ac._bearing, elevation: ac._elevation,
          targetBearing: ac._bearing, targetElevation: ac._elevation,
          tipX: this.cx, tipY: this.cy,
          ac, route: ac._route || null,
          lastSeen: now,
          scale: 0, colorT: ac._inSector ? 1 : 0,
          inSector: ac._inSector, exiting: false,
        });
      } else {
        const ar = this.arrows.get(ac.hex);
        ar.targetBearing = ac._bearing;
        ar.targetElevation = ac._elevation;
        ar.ac = ac;
        ar.inSector = ac._inSector;
        if (ac._route) ar.route = ac._route;
        ar.lastSeen = now;
        ar.exiting = false;
      }
    }

    for (const [hex, ar] of this.arrows) {
      if (!active.has(hex) && !ar.exiting) {
        if (now - ar.lastSeen > 12000) ar.exiting = true;
      }
    }

    this.updateTicker();
  }

  updateTicker() {
    const nearbyHexes = new Set();
    for (const [hex, ar] of this.arrows) {
      if (ar.inSector && !ar.exiting) nearbyHexes.add(hex);
    }
    for (const item of this.tickerItems) {
      if (!nearbyHexes.has(item.hex) && !item.exiting) item.exiting = true;
    }
    this.tickerItems = this.tickerItems.filter(it => !it.exiting || it.opacity > 0.01);

    for (const hex of nearbyHexes) {
      if (!this.tickerItems.find(it => it.hex === hex)) {
        const ar = this.arrows.get(hex);
        this.tickerItems.push({
          hex, flight: (ar.ac.flight || '').trim(),
          from: ar.route?.origin?.iata_code || null,
          to: ar.route?.destination?.iata_code || null,
          opacity: 0, exiting: false,
        });
      }
    }
    for (const item of this.tickerItems) {
      const ar = this.arrows.get(item.hex);
      if (ar) {
        item.flight = (ar.ac.flight || '').trim();
        if (ar.route?.origin) item.from = ar.route.origin.iata_code;
        if (ar.route?.destination) item.to = ar.route.destination.iata_code;
      }
    }
  }

  // ── Draw loop ────────────────────────────
  draw() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.animate(dt);
    this.drawClock();
    this.drawNearbyCount();
    this.drawCenterLabel();

    const activeHex = this.selectedHex || this.hoveredHex;
    const bgArrows = [], fgArrows = [];
    for (const [hex, ar] of this.arrows) {
      (ar.inSector ? fgArrows : bgArrows).push([hex, ar]);
    }
    for (const [hex, ar] of bgArrows) this.drawArrow(ar, false, false);
    for (const [hex, ar] of fgArrows) {
      this.drawArrow(ar, hex === activeHex, !!(activeHex && hex !== activeHex));
    }

    this.drawTicker();
    this.drawInfoPanel();

    for (const [hex, ar] of this.arrows) {
      if (ar.exiting && ar.scale < 0.01) {
        this.arrows.delete(hex);
        if (this.selectedHex === hex) this.selectedHex = null;
        if (this.hoveredHex === hex) this.hoveredHex = null;
      }
    }
  }

  animate(dt) {
    for (const [, ar] of this.arrows) {
      ar.bearing = lerpAngle(ar.bearing, ar.targetBearing, LERP_SPEED);
      ar.elevation += (ar.targetElevation - ar.elevation) * LERP_SPEED;
      const targetScale = ar.exiting ? 0 : 1;
      ar.scale = clamp(ar.scale + (targetScale - ar.scale) * ANIM_SPEED * dt, 0, 1);
      const targetC = ar.inSector ? 1 : 0;
      ar.colorT += (targetC - ar.colorT) * ANIM_SPEED * dt;
    }

    const hasActive = !!(this.selectedHex || this.hoveredHex);
    const targetPanel = hasActive ? 1 : 0;
    this.infoPanelOpacity += (targetPanel - this.infoPanelOpacity) * 8 * dt;
    if (this.infoPanelOpacity < 0.005) this.infoPanelOpacity = 0;
    if (this.infoPanelOpacity > 0.995) this.infoPanelOpacity = 1;

    for (const item of this.tickerItems) {
      if (item.exiting) item.opacity = Math.max(0, item.opacity - dt * 2.5);
      else item.opacity = Math.min(1, item.opacity + dt * 2);
    }
    const activeCount = this.tickerItems.filter(it => !it.exiting).length;
    if (activeCount > 0) {
      this.tickerScroll += TICKER_SPEED * dt;
      const total = activeCount * TICKER_ITEM_H;
      if (total > 0) this.tickerScroll %= total;
    } else {
      this.tickerScroll = 0;
    }
  }

  // ── Arrows ───────────────────────────────
  drawArrow(ar, isActive, isFaded) {
    const { ctx, dpr } = this;
    const relBearing = ar.bearing - APT.heading;
    const angleRad = (relBearing - 90) * (Math.PI / 180);
    const elevClamped = clamp(ar.elevation, 0, 90);
    const dist = this.maxRadius * (1 - elevClamped / 90);

    const tipX = this.cx + Math.cos(angleRad) * dist;
    const tipY = this.cy + Math.sin(angleRad) * dist;
    ar.tipX = tipX;
    ar.tipY = tipY;

    const baseSize = ar.inSector ? ARROW_SIZE_ACTIVE : ARROW_SIZE_BG;
    const size = baseSize * dpr * easeOut(ar.scale);
    if (size < 1) return;

    const color = lerpColor(GREY, ORANGE, ar.colorT);
    let opacity;
    if (isActive) {
      opacity = 1;
    } else if (isFaded) {
      opacity = 0.15;
    } else {
      const orangeOp = distOpacity(ar.ac._distKm || 0);
      opacity = GREY_OPACITY + (orangeOp - GREY_OPACITY) * ar.colorT;
    }
    opacity *= easeOut(ar.scale);

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angleRad);
    ctx.beginPath();
    ctx.moveTo(ARROW_SHAPE[0][0] * size, ARROW_SHAPE[0][1] * size);
    for (let i = 1; i < ARROW_SHAPE.length; i++) {
      ctx.lineTo(ARROW_SHAPE[i][0] * size, ARROW_SHAPE[i][1] * size);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(color, opacity);
    ctx.fill();
    ctx.restore();
  }

  // ── Center label ─────────────────────────
  drawCenterLabel() {
    const { ctx, cx, cy, dpr } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = `600 ${20 * dpr}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A1601', cx, cy);
    ctx.restore();
  }

  // ── Clock ────────────────────────────────
  drawClock() {
    const { ctx, dpr } = this;
    const pad = 32 * dpr;
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${28 * dpr}px ${FONT}`;
    ctx.fillText(`${h}:${m} ${ampm}`, pad, pad);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `400 ${13 * dpr}px ${FONT}`;
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    ctx.fillText(dateStr, pad, pad + 36 * dpr);
    ctx.restore();
  }

  // ── Nearby count ─────────────────────────
  drawNearbyCount() {
    const { ctx, dpr } = this;
    const pad = 32 * dpr;
    const count = [...this.arrows.values()].filter(a => a.inSector && !a.exiting).length;
    let text;
    if (count === 0) text = 'No airplanes nearby';
    else if (count === 1) text = 'Look outside! There is 1 airplane near you';
    else text = `Look outside! There are ${count} airplanes near you`;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `400 ${13 * dpr}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, pad, pad + 58 * dpr);
    ctx.restore();
  }

  // ── Ticker (top-right) ───────────────────
  drawTicker() {
    const { ctx, canvas, dpr } = this;
    const activeItems = this.tickerItems.filter(it => !it.exiting);
    const exitingItems = this.tickerItems.filter(it => it.exiting);

    const pad = 32 * dpr;
    const boxW = 180 * dpr;            // fixed width for the ticker column
    const itemH = TICKER_ITEM_H * dpr;
    const headH = TICKER_HEADING_H * dpr;
    const boxRight = canvas.width - pad;
    const boxLeft = boxRight - boxW;
    const boxCenterX = boxLeft + boxW / 2;
    const startY = pad;

    // Draw heading "Flights ↗" — centered in the box
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 ${14 * dpr}px ${FONT}`;
    const headingText = 'Flights';
    const headingW = ctx.measureText(headingText).width;
    const headingGroupW = headingW + 20 * dpr; // text + gap + arrow
    const headingStartX = boxCenterX - headingGroupW / 2;
    ctx.textAlign = 'left';
    ctx.fillText(headingText, headingStartX, startY);
    // Draw ↗ arrow
    const arrowX = headingStartX + headingW + 16 * dpr;
    const arrowY = startY + 3 * dpr;
    const arrowS = 11 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(arrowX - arrowS, arrowY + arrowS);
    ctx.lineTo(arrowX, arrowY);
    ctx.lineTo(arrowX - arrowS * 0.55, arrowY);
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX, arrowY + arrowS * 0.55);
    ctx.stroke();
    ctx.restore();

    if (activeItems.length === 0 && exitingItems.length === 0) {
      this.tickerVisibleItems = [];
      return;
    }

    const itemStartY = startY + headH;
    const maxH = Math.min(canvas.height * 0.45, 6 * itemH);
    const totalH = activeItems.length * itemH;
    const visibleItems = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(boxLeft, itemStartY, boxW, maxH);
    ctx.clip();

    if (totalH > 0) {
      if (totalH > maxH) {
        const scrollMod = (this.tickerScroll * dpr) % totalH;
        for (let copy = -1; copy <= 1; copy++) {
          for (let i = 0; i < activeItems.length; i++) {
            const y = itemStartY + i * itemH - scrollMod + copy * totalH;
            if (y < itemStartY - itemH || y > itemStartY + maxH) continue;
            this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, activeItems[i]);
            visibleItems.push({
              hex: activeItems[i].hex,
              left: boxLeft, right: boxRight,
              top: Math.max(y, itemStartY),
              bottom: Math.min(y + itemH, itemStartY + maxH),
            });
          }
        }
      } else {
        for (let i = 0; i < activeItems.length; i++) {
          const y = itemStartY + i * itemH;
          this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, activeItems[i]);
          visibleItems.push({
            hex: activeItems[i].hex,
            left: boxLeft, right: boxRight,
            top: y, bottom: y + itemH,
          });
        }
      }
    }

    for (const item of exitingItems) {
      const idx = this.tickerItems.indexOf(item);
      const y = itemStartY + idx * itemH;
      if (y < itemStartY + maxH) this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, item);
    }

    ctx.restore();
    this.tickerVisibleItems = visibleItems;
  }

  drawTickerItem(centerX, boxLeft, boxRight, y, item) {
    const { ctx, dpr } = this;
    const alpha = item.opacity;
    if (alpha < 0.01) return;

    const activeHex = this.selectedHex || this.hoveredHex;
    const isHighlighted = item.hex === activeHex;
    const boxW = boxRight - boxLeft;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Highlight background on hover/select
    if (isHighlighted) {
      const hlPad = 6 * dpr;
      roundRect(ctx, boxLeft + hlPad, y + 2 * dpr, boxW - hlPad * 2, TICKER_ITEM_H * dpr - 4 * dpr, 8 * dpr);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = isHighlighted ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${15 * dpr}px ${FONT}`;
    ctx.fillText(item.flight || '—', centerX, y + 6 * dpr);

    if (item.from && item.to) {
      ctx.fillStyle = isHighlighted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)';
      ctx.font = `400 ${12 * dpr}px ${FONT}`;
      ctx.fillText(`${item.from} → ${item.to}`, centerX, y + 28 * dpr);
    }

    // Separator line — centered
    ctx.globalAlpha = alpha * 0.08;
    ctx.fillStyle = '#fff';
    const lineW = TICKER_LINE_W * dpr;
    ctx.fillRect(centerX - lineW / 2, y + TICKER_ITEM_H * dpr - 1 * dpr, lineW, 1 * dpr);

    ctx.restore();
  }

  // ── Info panel (bottom-left) ─────────────
  drawInfoPanel() {
    if (this.infoPanelOpacity < 0.01) return;
    const activeHex = this.selectedHex || this.hoveredHex;
    if (!activeHex || !this.arrows.has(activeHex)) return;

    const ar = this.arrows.get(activeHex);
    const ac = ar.ac;
    const route = ar.route;
    const { ctx, canvas, dpr } = this;
    const a = this.infoPanelOpacity;

    const cardW = 340 * dpr;
    const cardPad = 24 * dpr;
    const cardX = 32 * dpr;

    const flight = (ac.flight || '').trim() || ac.hex;
    const airline = getAirline(ac.flight);
    const model = ac.desc || ac.t || '—';
    const dist = ac._distKm != null ? ac._distKm.toFixed(1) + ' km' : '—';
    const hasRoute = route?.origin && route?.destination;

    // Calculate card height
    let cardH = cardPad + 14 * dpr + 14 * dpr + 40 * dpr; // header + flight code
    if (hasRoute) {
      cardH += 18 * dpr + 14 * dpr + 8 * dpr; // ROUTE label
      cardH += 24 * dpr; // airport codes line
      cardH += 18 * dpr; // city names line
    }
    cardH += 22 * dpr + 14 * dpr + 6 * dpr + 16 * dpr; // AIRLINE/AIRCRAFT labels + values
    cardH += 22 * dpr + 14 * dpr + 6 * dpr + 20 * dpr; // PROXIMITY label + value
    cardH += cardPad;

    const cardY = canvas.height - 32 * dpr - cardH;

    ctx.save();
    ctx.globalAlpha = a;

    roundRect(ctx, cardX, cardY, cardW, cardH, 14 * dpr);
    ctx.fillStyle = 'rgba(14, 14, 14, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    let x = cardX + cardPad;
    let y = cardY + cardPad;
    const contentW = cardW - cardPad * 2;

    // ACTIVE TRACKING
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `600 ${11 * dpr}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('✈  ACTIVE TRACKING', x, y);
    y += 14 * dpr + 14 * dpr;

    // Flight code
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${32 * dpr}px ${FONT}`;
    ctx.fillText(flight, x, y);
    y += 40 * dpr;

    // Route
    if (hasRoute) {
      y += 18 * dpr;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${11 * dpr}px ${FONT}`;
      ctx.fillText('ROUTE', x, y);
      y += 14 * dpr + 8 * dpr;

      // Route SVG icon
      const iconSize = 18 * dpr;
      drawSvgIcon(ctx, routePath, x, y + 1 * dpr, iconSize, 'rgba(255,255,255,0.5)');

      // Airport codes
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `600 ${17 * dpr}px ${FONT}`;
      ctx.fillText(`${route.origin.iata_code}  →  ${route.destination.iata_code}`, x + 24 * dpr, y);
      y += 24 * dpr;

      // City names
      const originCity = route.origin.municipality || route.origin.name || '';
      const destCity = route.destination.municipality || route.destination.name || '';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `400 ${12 * dpr}px ${FONT}`;
      const cityMaxW = (cardX + cardW - cardPad) - (x + 24 * dpr);
      ctx.fillText(truncateText(ctx, `${originCity}  →  ${destCity}`, cityMaxW), x + 24 * dpr, y);
      y += 18 * dpr;
    }

    // Airline + Aircraft columns
    y += 22 * dpr;
    const col2X = x + contentW * 0.52;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `600 ${10 * dpr}px ${FONT}`;
    ctx.fillText('AIRLINE', x, y);
    ctx.fillText('AIRCRAFT', col2X, y);
    y += 14 * dpr + 6 * dpr;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${14 * dpr}px ${FONT}`;
    const col1MaxW = col2X - x - 8 * dpr;
    const col2MaxW = (cardX + cardW - cardPad) - col2X;
    ctx.fillText(truncateText(ctx, airline || '—', col1MaxW), x, y);
    ctx.fillText(truncateText(ctx, model, col2MaxW), col2X, y);
    y += 16 * dpr;

    // Proximity
    y += 22 * dpr;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `600 ${10 * dpr}px ${FONT}`;
    ctx.fillText('PROXIMITY', x, y);
    y += 14 * dpr + 6 * dpr;

    // Proximity SVG icon
    const proxIconSize = 18 * dpr;
    drawSvgIcon(ctx, proximityPath, x, y + 1 * dpr, proxIconSize, 'rgba(255,255,255,0.4)');

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `500 ${17 * dpr}px ${FONT}`;
    ctx.fillText(dist, x + 24 * dpr, y);

    ctx.restore();
  }
}

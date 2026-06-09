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
const TICKER_ITEM_H_FULL = 56;  // with route
const TICKER_ITEM_H_SLIM = 36;  // flight code only
const TICKER_HEADING_H = 36;
const TICKER_W = 260;
const TICKER_LINE_W = 120;

function tickerItemH(item) {
  return (item.from && item.to) ? TICKER_ITEM_H_FULL : TICKER_ITEM_H_SLIM;
}
function tickerOffsets(items) {
  const offsets = [];
  let cum = 0;
  for (const item of items) { offsets.push(cum); cum += tickerItemH(item); }
  return { offsets, totalH: cum };
}

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

function wrapText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
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
    this.uiScale = 1;
    this.tickerItems = [];
    this.tickerScroll = 0;
    this.tickerVisibleItems = []; // for hit testing
    this.flipped = false;
    this.flipBtnBounds = null;

    // Offscreen canvas for frosted glass blur
    this._blurCanvas = document.createElement('canvas');
    this._blurCtx = this._blurCanvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('mousemove', e => {
      const mx = e.clientX * this.dpr;
      const my = e.clientY * this.dpr;
      if (this.isOverFlipBtn(mx, my)) {
        canvas.style.cursor = 'pointer';
        this.hoveredHex = null;
        return;
      }
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
      if (this.isOverFlipBtn(mx, my)) {
        this.flipped = !this.flipped;
        return;
      }
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
    // Scale UI proportionally for large screens (e.g. 70"+ TVs at 4K/1080p)
    this.uiScale = Math.max(1, Math.min(2.5, window.innerWidth / 1440));
    this._blurCanvas.width = this.canvas.width;
    this._blurCanvas.height = this.canvas.height;
  }

  arrowHitTest(mx, my) {
    let best = null, bestD = HIT_RADIUS * this.dpr * this.uiScale;
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

  isOverFlipBtn(mx, my) {
    const b = this.flipBtnBounds;
    return b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
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
    this.drawFlipButton();

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
    const activeItems = this.tickerItems.filter(it => !it.exiting);
    if (activeItems.length > 0) {
      this.tickerScroll += TICKER_SPEED * dt;
      const { totalH } = tickerOffsets(activeItems);
      if (totalH > 0) this.tickerScroll %= totalH;
    } else {
      this.tickerScroll = 0;
    }
  }

  // ── Arrows ───────────────────────────────
  drawArrow(ar, isActive, isFaded) {
    const { ctx, dpr } = this;
    const s = dpr * this.uiScale;
    const relBearing = ar.bearing - APT.heading;
    const angleRad = (relBearing - 90) * (Math.PI / 180);
    const elevClamped = clamp(ar.elevation, 0, 90);
    const dist = this.maxRadius * (1 - elevClamped / 90);

    // Flip: mirror x around the center
    const xDir = this.flipped ? -1 : 1;
    const tipX = this.cx + xDir * Math.cos(angleRad) * dist;
    const tipY = this.cy + Math.sin(angleRad) * dist;
    ar.tipX = tipX;
    ar.tipY = tipY;

    // When flipped, mirror the draw angle horizontally: angle → π - angle
    const drawAngle = this.flipped ? Math.PI - angleRad : angleRad;

    const baseSize = ar.inSector ? ARROW_SIZE_ACTIVE : ARROW_SIZE_BG;
    const size = baseSize * s * easeOut(ar.scale);
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
    ctx.rotate(drawAngle);
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
    const s = dpr * this.uiScale;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = `600 ${20 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A1601', cx, cy);
    ctx.restore();
  }

  // ── Clock ────────────────────────────────
  drawClock() {
    const { ctx, dpr } = this;
    const s = dpr * this.uiScale;
    const pad = 32 * s;
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${28 * s}px ${FONT}`;
    ctx.fillText(`${h}:${m} ${ampm}`, pad, pad);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `400 ${13 * s}px ${FONT}`;
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    ctx.fillText(dateStr, pad, pad + 36 * s);
    ctx.restore();
  }

  // ── Nearby count ─────────────────────────
  drawNearbyCount() {
    const { ctx, dpr } = this;
    const s = dpr * this.uiScale;
    const pad = 32 * s;
    const count = [...this.arrows.values()].filter(a => a.inSector && !a.exiting).length;
    let text;
    if (count === 0) text = 'No airplanes nearby';
    else if (count === 1) text = 'Look outside! There is 1 airplane near you';
    else text = `Look outside! There are ${count} airplanes near you`;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `400 ${13 * s}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, pad, pad + 58 * s);
    ctx.restore();
  }

  // ── Ticker (top-right) ───────────────────
  drawTicker() {
    const { ctx, canvas, dpr } = this;
    const s = dpr * this.uiScale;
    const activeItems = this.tickerItems.filter(it => !it.exiting);
    const exitingItems = this.tickerItems.filter(it => it.exiting);

    const pad = 32 * s;
    const boxW = 180 * s;
    const headH = TICKER_HEADING_H * s;
    const boxRight = canvas.width - pad;
    const boxLeft = boxRight - boxW;
    const boxCenterX = boxLeft + boxW / 2;
    const startY = pad;

    // Draw heading "Flights ↗" — centered in the box
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `500 ${14 * s}px ${FONT}`;
    const headingText = 'Flights';
    const headingW = ctx.measureText(headingText).width;
    const headingGroupW = headingW + 20 * s; // text + gap + arrow
    const headingStartX = boxCenterX - headingGroupW / 2;
    ctx.textAlign = 'left';
    ctx.fillText(headingText, headingStartX, startY);
    // Draw ↗ arrow
    const arrowX = headingStartX + headingW + 16 * s;
    const arrowY = startY + 3 * s;
    const arrowS = 11 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(arrowX - arrowS, arrowY + arrowS);
    ctx.lineTo(arrowX, arrowY);
    ctx.lineTo(arrowX - arrowS * 0.55, arrowY);
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX, arrowY + arrowS * 0.55);
    ctx.stroke();
    // Underline beneath heading
    const underlineY = startY + 20 * s;
    const underlineW = headingGroupW + 4 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxCenterX - underlineW / 2, underlineY, underlineW, 1 * s);
    ctx.restore();

    if (activeItems.length === 0 && exitingItems.length === 0) {
      this.tickerVisibleItems = [];
      return;
    }

    const itemStartY = startY + headH;
    const maxH = Math.min(canvas.height * 0.45, 6 * TICKER_ITEM_H_FULL * s);
    const { offsets, totalH } = tickerOffsets(activeItems);
    const totalHpx = totalH * s;
    const visibleItems = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(boxLeft, itemStartY, boxW, maxH);
    ctx.clip();

    if (totalHpx > 0) {
      if (totalHpx > maxH) {
        const scrollMod = (this.tickerScroll * s) % totalHpx;
        for (let copy = -1; copy <= 1; copy++) {
          for (let i = 0; i < activeItems.length; i++) {
            const ih = tickerItemH(activeItems[i]) * s;
            const y = itemStartY + offsets[i] * s - scrollMod + copy * totalHpx;
            if (y < itemStartY - ih || y > itemStartY + maxH) continue;
            this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, activeItems[i]);
            visibleItems.push({
              hex: activeItems[i].hex,
              left: boxLeft, right: boxRight,
              top: Math.max(y, itemStartY),
              bottom: Math.min(y + ih, itemStartY + maxH),
            });
          }
        }
      } else {
        for (let i = 0; i < activeItems.length; i++) {
          const ih = tickerItemH(activeItems[i]) * s;
          const y = itemStartY + offsets[i] * s;
          this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, activeItems[i]);
          visibleItems.push({
            hex: activeItems[i].hex,
            left: boxLeft, right: boxRight,
            top: y, bottom: y + ih,
          });
        }
      }
    }

    for (const item of exitingItems) {
      const idx = this.tickerItems.indexOf(item);
      const { offsets: exitOffsets } = tickerOffsets(this.tickerItems.slice(0, idx + 1));
      const y = itemStartY + (exitOffsets[idx] || 0) * s;
      if (y < itemStartY + maxH) this.drawTickerItem(boxCenterX, boxLeft, boxRight, y, item);
    }

    ctx.restore();
    this.tickerVisibleItems = visibleItems;
  }

  drawTickerItem(centerX, boxLeft, boxRight, y, item) {
    const { ctx, dpr } = this;
    const s = dpr * this.uiScale;
    const alpha = item.opacity;
    if (alpha < 0.01) return;

    const activeHex = this.selectedHex || this.hoveredHex;
    const isHighlighted = item.hex === activeHex;
    const ih = tickerItemH(item) * s;
    const hasRoute = !!(item.from && item.to);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Glow on hover/select — shadowBlur creates the soft light effect
    if (isHighlighted) {
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 12 * s;
    }

    // Vertically center flight code when there's no route
    const flightY = hasRoute ? y + 6 * s : y + (ih - 16 * s) / 2;

    ctx.fillStyle = isHighlighted ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${15 * s}px ${FONT}`;
    ctx.fillText(item.flight || '—', centerX, flightY);

    if (hasRoute) {
      ctx.shadowBlur = isHighlighted ? 8 * s : 0;
      ctx.fillStyle = isHighlighted ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.font = `400 ${12 * s}px ${FONT}`;
      ctx.fillText(`${item.from} → ${item.to}`, centerX, y + 28 * s);
    }

    ctx.shadowBlur = 0;

    // Separator line — centered
    ctx.globalAlpha = alpha * 0.08;
    ctx.fillStyle = '#fff';
    const lineW = TICKER_LINE_W * s;
    ctx.fillRect(centerX - lineW / 2, y + ih - 1 * s, lineW, 1 * s);

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
    const s = dpr * this.uiScale;
    const a = this.infoPanelOpacity;

    const cardW = 340 * s;
    const cardPad = 24 * s;
    const cardX = 32 * s;

    const flight = (ac.flight || '').trim() || ac.hex;
    const airline = getAirline(ac.flight);
    const model = ac.desc || ac.t || '—';
    const dist = ac._distKm != null ? ac._distKm.toFixed(1) + ' km' : '—';
    const hasRoute = route?.origin && route?.destination;

    // Pre-compute wrapped lines so card height can account for them
    const col2X_pre = (cardX + cardPad) + (cardW - cardPad * 2) * 0.52;
    const col1MaxW = col2X_pre - (cardX + cardPad) - 8 * s;
    const col2MaxW = (cardX + cardW - cardPad) - col2X_pre;
    const lineH = 16 * s;
    const cityLineH = 16 * s;

    ctx.save();
    ctx.font = `500 ${14 * s}px ${FONT}`;
    const airlineLines = wrapText(ctx, airline || '—', col1MaxW);
    const modelLines   = wrapText(ctx, model,          col2MaxW);
    let cityLineCount = 0;
    if (hasRoute) {
      const originCity = route.origin.municipality || route.origin.name || '';
      const destCity = route.destination.municipality || route.destination.name || '';
      ctx.font = `400 ${12 * s}px ${FONT}`;
      const cityMaxW = (cardX + cardW - cardPad) - (cardX + cardPad + 24 * s);
      cityLineCount = wrapText(ctx, `${originCity}  →  ${destCity}`, cityMaxW).length;
    }
    ctx.restore();

    const colRows = Math.max(airlineLines.length, modelLines.length);

    // Calculate card height
    let cardH = cardPad + 14 * s + 14 * s + 40 * s; // header + flight code
    if (hasRoute) {
      cardH += 18 * s + 14 * s + 8 * s;    // ROUTE label
      cardH += 24 * s;                       // airport codes line
      cardH += cityLineCount * cityLineH;    // city names (wrapped)
    }
    cardH += 22 * s + 14 * s + 6 * s;        // AIRLINE/AIRCRAFT labels
    cardH += colRows * lineH;                 // wrapped value rows
    cardH += 22 * s + 14 * s + 6 * s + 20 * s; // PROXIMITY label + value
    cardH += cardPad;

    const cardY = canvas.height - 32 * s - cardH;

    ctx.save();
    ctx.globalAlpha = a;

    // ── Frosted glass background ──────────────
    // Capture and blur the canvas content behind the panel
    this._blurCtx.clearRect(0, 0, canvas.width, canvas.height);
    this._blurCtx.filter = `blur(${18 * dpr}px)`;
    this._blurCtx.drawImage(canvas, 0, 0);
    this._blurCtx.filter = 'none';

    // Clip to panel shape, draw blurred bg + dark tint
    roundRect(ctx, cardX, cardY, cardW, cardH, 14 * s);
    ctx.save();
    ctx.clip();
    ctx.drawImage(this._blurCanvas, 0, 0);
    // Dark tint for readability over the blurred content
    ctx.fillStyle = 'rgba(8, 10, 18, 0.70)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.restore();

    // Subtle border
    roundRect(ctx, cardX, cardY, cardW, cardH, 14 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    let x = cardX + cardPad;
    let y = cardY + cardPad;
    const contentW = cardW - cardPad * 2;

    // ACTIVE TRACKING
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `600 ${11 * s}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('✈  ACTIVE TRACKING', x, y);
    y += 14 * s + 14 * s;

    // Flight code
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${32 * s}px ${FONT}`;
    ctx.fillText(flight, x, y);
    y += 40 * s;

    // Route
    if (hasRoute) {
      y += 18 * s;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${11 * s}px ${FONT}`;
      ctx.fillText('ROUTE', x, y);
      y += 14 * s + 8 * s;

      // Route SVG icon
      const iconSize = 18 * s;
      drawSvgIcon(ctx, routePath, x, y + 1 * s, iconSize, 'rgba(255,255,255,0.5)');

      // Airport codes
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = `600 ${17 * s}px ${FONT}`;
      ctx.fillText(`${route.origin.iata_code}  →  ${route.destination.iata_code}`, x + 24 * s, y);
      y += 24 * s;

      // City names
      const originCity = route.origin.municipality || route.origin.name || '';
      const destCity = route.destination.municipality || route.destination.name || '';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `400 ${12 * s}px ${FONT}`;
      const cityMaxW = (cardX + cardW - cardPad) - (x + 24 * s);
      const cityLines = wrapText(ctx, `${originCity}  →  ${destCity}`, cityMaxW);
      cityLines.forEach((line, i) => ctx.fillText(line, x + 24 * s, y + i * 16 * s));
      y += cityLines.length * 16 * s;
    }

    // Airline + Aircraft columns
    y += 22 * s;
    const col2X = x + contentW * 0.52;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `600 ${10 * s}px ${FONT}`;
    ctx.fillText('AIRLINE', x, y);
    ctx.fillText('AIRCRAFT', col2X, y);
    y += 14 * s + 6 * s;

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${14 * s}px ${FONT}`;
    for (let i = 0; i < colRows; i++) {
      if (airlineLines[i]) ctx.fillText(airlineLines[i], x, y + i * lineH);
      if (modelLines[i])   ctx.fillText(modelLines[i],   col2X, y + i * lineH);
    }
    y += colRows * lineH;

    // Proximity
    y += 22 * s;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `600 ${10 * s}px ${FONT}`;
    ctx.fillText('PROXIMITY', x, y);
    y += 14 * s + 6 * s;

    // Proximity SVG icon
    const proxIconSize = 18 * s;
    drawSvgIcon(ctx, proximityPath, x, y + 1 * s, proxIconSize, 'rgba(255,255,255,0.4)');

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `500 ${17 * s}px ${FONT}`;
    ctx.fillText(dist, x + 24 * s, y);

    ctx.restore();
  }

  // ── Flip button (bottom-right) ────────────
  drawFlipButton() {
    const { ctx, canvas, dpr } = this;
    const s = dpr * this.uiScale;
    const pad = 32 * s;
    const btnW = 52 * s;
    const btnH = 36 * s;
    const btnX = canvas.width - pad - btnW;
    const btnY = canvas.height - pad - btnH;
    const r = 10 * s;

    this.flipBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.save();

    // Background pill
    const isActive = this.flipped;
    roundRect(ctx, btnX, btnY, btnW, btnH, r);
    ctx.fillStyle = isActive ? 'rgba(255,140,0,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = isActive ? 'rgba(255,140,0,0.5)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Flip icon: two horizontal arrows ⇔
    const cx = btnX + btnW / 2;
    const cy = btnY + btnH / 2;
    const aw = 11 * s;  // half-width of each arrow
    const ah = 4 * s;   // arrowhead size
    const gap = 3 * s;  // gap between the two arrows
    const col = isActive ? `rgba(255,140,0,0.9)` : `rgba(255,255,255,0.6)`;

    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.5 * s;
    ctx.lineCap = 'round';

    // Left arrow ←
    const lx = cx - gap;
    ctx.beginPath();
    ctx.moveTo(lx, cy);
    ctx.lineTo(lx - aw, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx - aw, cy);
    ctx.lineTo(lx - aw + ah, cy - ah);
    ctx.moveTo(lx - aw, cy);
    ctx.lineTo(lx - aw + ah, cy + ah);
    ctx.stroke();

    // Right arrow →
    const rx = cx + gap;
    ctx.beginPath();
    ctx.moveTo(rx, cy);
    ctx.lineTo(rx + aw, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + aw, cy);
    ctx.lineTo(rx + aw - ah, cy - ah);
    ctx.moveTo(rx + aw, cy);
    ctx.lineTo(rx + aw - ah, cy + ah);
    ctx.stroke();

    ctx.restore();
  }
}

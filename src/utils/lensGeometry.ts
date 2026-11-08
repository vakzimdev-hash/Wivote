/**
 * Geometry and hit-testing utilities for interactive Canvas text selection
 * Supports:
 * - Direct point tap / touch detection
 * - Strike-through line segment intersection with word bounding boxes
 * - Circle-to-Search / Lasso polygon containment (Ray-Casting Algorithm)
 * - Proximity and stroke sweep detection
 */

export interface NormalizedPoint {
  x: number; // 0 to 1
  y: number; // 0 to 1
}

export interface NormalizedRect {
  x: number; // 0 to 1
  y: number; // 0 to 1
  width: number;
  height: number;
}

/**
 * Checks if a point lies inside a rectangle (with optional normalized padding tolerance)
 */
export function pointInRect(
  pt: NormalizedPoint,
  rect: NormalizedRect,
  padding: number = 0.006
): boolean {
  return (
    pt.x >= rect.x - padding &&
    pt.x <= rect.x + rect.width + padding &&
    pt.y >= rect.y - padding &&
    pt.y <= rect.y + rect.height + padding
  );
}

/**
 * Tests if two 2D line segments (p1-p2) and (p3-p4) intersect
 */
function lineSegmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return false;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Tests if a line segment (p1 -> p2) strikes through or enters a rectangle
 */
export function segmentIntersectsRect(
  p1: NormalizedPoint,
  p2: NormalizedPoint,
  rect: NormalizedRect
): boolean {
  // If either endpoint is inside the rect, it intersects
  if (pointInRect(p1, rect) || pointInRect(p2, rect)) {
    return true;
  }

  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Test against 4 bounding edges
  if (lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, left, top, right, top)) return true;
  if (lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, right, top, right, bottom)) return true;
  if (lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, right, bottom, left, bottom)) return true;
  if (lineSegmentsIntersect(p1.x, p1.y, p2.x, p2.y, left, bottom, left, top)) return true;

  return false;
}

/**
 * Ray-Casting algorithm for Point-in-Polygon (Circle to Search / Lasso enclosure)
 * Returns true if point is enclosed within polygon vertices
 */
export function pointInPolygon(
  point: NormalizedPoint,
  polygon: NormalizedPoint[]
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates squared distance between point and line segment
 */
function distSqToSegment(
  p: NormalizedPoint,
  v: NormalizedPoint,
  w: NormalizedPoint
): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) {
    return (p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y);
  }
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
}

/**
 * Checks if a gesture stroke path strikes through or encloses a word rectangle.
 * Used during interactive drag / strike-through / circle-to-search gestures.
 */
export function gestureIntersectsRect(
  strokePoints: NormalizedPoint[],
  rect: NormalizedRect,
  tolerance: number = 0.012
): boolean {
  if (strokePoints.length === 0) return false;

  const rectCenter: NormalizedPoint = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };

  // 1. Single point tap
  if (strokePoints.length === 1) {
    return pointInRect(strokePoints[0], rect, tolerance);
  }

  // 2. Strike-through line segment test: check latest segments
  for (let i = 1; i < strokePoints.length; i++) {
    const pPrev = strokePoints[i - 1];
    const pCurr = strokePoints[i];

    if (segmentIntersectsRect(pPrev, pCurr, rect)) {
      return true;
    }

    // Proximity tolerance to center
    const distSq = distSqToSegment(rectCenter, pPrev, pCurr);
    if (distSq <= tolerance * tolerance) {
      return true;
    }
  }

  // 3. Circle-to-Search / Lasso Enclosure test:
  // If stroke has at least 8 points and covers reasonable distance, test if the word's center is enclosed
  if (strokePoints.length >= 8) {
    const first = strokePoints[0];
    const last = strokePoints[strokePoints.length - 1];
    const closureDist = Math.hypot(first.x - last.x, first.y - last.y);

    // If loop is closed or near closed (within 20% of canvas diagonal), or long stroke
    if (closureDist < 0.22 || strokePoints.length > 20) {
      if (pointInPolygon(rectCenter, strokePoints)) {
        return true;
      }
    }
  }

  return false;
}

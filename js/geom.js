/** Shared two-dimensional helpers for generated arena geometry. */
export function pointInPolygon(point, polygon) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function midpoint(start, end) {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

/** Snaps a generated opening to the closest parallel wall segment. */
export function alignLineToPolygons(
  line,
  polygons,
  maxDistance = 0.35,
  maxAngleDegrees = 15,
) {
  const [start, end] = line;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { line, snapped: false, distance: 0 };
  const direction = { x: dx / length, y: dy / length };
  const center = midpoint(start, end);
  const maxCross = Math.sin((maxAngleDegrees * Math.PI) / 180);
  let best;
  for (const polygon of polygons)
    for (let index = 0; index < polygon.length; index++) {
      const wallStart = polygon[index];
      const wallEnd = polygon[(index + 1) % polygon.length];
      const wallDx = wallEnd.x - wallStart.x;
      const wallDy = wallEnd.y - wallStart.y;
      const wallLength = Math.hypot(wallDx, wallDy);
      if (wallLength < Math.min(0.35, length * 0.35)) continue;
      const wallDirection = { x: wallDx / wallLength, y: wallDy / wallLength };
      const cross = Math.abs(
        direction.x * wallDirection.y - direction.y * wallDirection.x,
      );
      if (cross > maxCross) continue;
      const projection = Math.max(
        0,
        Math.min(
          1,
          ((center.x - wallStart.x) * wallDx +
            (center.y - wallStart.y) * wallDy) /
            (wallLength * wallLength),
        ),
      );
      const snappedCenter = {
        x: wallStart.x + projection * wallDx,
        y: wallStart.y + projection * wallDy,
      };
      const distance = Math.hypot(
        snappedCenter.x - center.x,
        snappedCenter.y - center.y,
      );
      if (
        distance > maxDistance ||
        (best && distance + cross * 0.5 >= best.score)
      )
        continue;
      const sign =
        direction.x * wallDirection.x + direction.y * wallDirection.y >= 0
          ? 1
          : -1;
      const half = {
        x: (wallDirection.x * length * sign) / 2,
        y: (wallDirection.y * length * sign) / 2,
      };
      best = {
        score: distance + cross * 0.5,
        distance,
        line: [
          { x: snappedCenter.x - half.x, y: snappedCenter.y - half.y },
          { x: snappedCenter.x + half.x, y: snappedCenter.y + half.y },
        ],
      };
    }
  return best
    ? { line: best.line, snapped: true, distance: best.distance }
    : { line, snapped: false, distance: 0 };
}

export function passagePolygon(start, end, depth) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const halfDepth = depth / 2;
  return [
    { x: start.x + normal.x * halfDepth, y: start.y + normal.y * halfDepth },
    { x: end.x + normal.x * halfDepth, y: end.y + normal.y * halfDepth },
    { x: end.x - normal.x * halfDepth, y: end.y - normal.y * halfDepth },
    { x: start.x - normal.x * halfDepth, y: start.y - normal.y * halfDepth },
  ];
}

export function footprintCorners(placement, size) {
  const angle = ((placement.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    [-size.x / 2, -size.y / 2],
    [size.x / 2, -size.y / 2],
    [size.x / 2, size.y / 2],
    [-size.x / 2, size.y / 2],
  ].map(([x, y]) => ({
    x: placement.x + x * cosine - y * sine,
    y: placement.y + x * sine + y * cosine,
  }));
}

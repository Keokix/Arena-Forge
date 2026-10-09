/**
 * Enemy perception, tactics and navigation, independent of Three.js.
 * Horizontal positions use arena coordinates: x = world x, y = -world z.
 * Heights are measured from the floor. Rendering, damage and movement belong
 * to the scene; this module only returns decisions that can be tested in Node.
 */

export const AI_CONSTANTS = Object.freeze({
  radius: 0.24,
  cellSize: 0.58,
  maxNodes: 16000,
  maxVisited: 3500,
  sightRange: 25,
  memorySeconds: 6,
  hearingSeconds: 1.8,
  reactionSeconds: 0.32,
  maxJumpHeight: 0.82,
  jumpVelocity: 4.8,
  gravity: 12,
  repathSeconds: 0.7,
});

const EPSILON = 1e-7;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const copyPoint = (point) => ({ x: point.x, y: point.y, ...(point.feetHeight != null ? { feetHeight: point.feetHeight } : {}) });
const pointOf = (value) => Array.isArray(value) ? { x: value[0], y: value[1] } : value;
const ringBoundsCache = new WeakMap();
const floorIndexCache = new WeakMap();

function ringBounds(ring) {
  if (ringBoundsCache.has(ring)) return ringBoundsCache.get(ring);
  const vertices = ring.map(pointOf);
  const bounds = {
    minX: Math.min(...vertices.map((point) => point.x)), minY: Math.min(...vertices.map((point) => point.y)),
    maxX: Math.max(...vertices.map((point) => point.x)), maxY: Math.max(...vertices.map((point) => point.y)),
  };
  ringBoundsCache.set(ring, bounds);
  return bounds;
}

function nearRing(point, ring, margin = 0) {
  const bounds = ringBounds(ring);
  return point.x >= bounds.minX - margin - EPSILON && point.x <= bounds.maxX + margin + EPSILON && point.y >= bounds.minY - margin - EPSILON && point.y <= bounds.maxY + margin + EPSILON;
}

function nearSegment(from, to, ring, margin = 0) {
  const bounds = ringBounds(ring);
  return Math.max(from.x, to.x) >= bounds.minX - margin && Math.min(from.x, to.x) <= bounds.maxX + margin && Math.max(from.y, to.y) >= bounds.minY - margin && Math.min(from.y, to.y) <= bounds.maxY + margin;
}

function segmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fraction = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(point.x - start.x - dx * fraction, point.y - start.y - dy * fraction);
}

function insideRing(point, ring) {
  if (!nearRing(point, ring)) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = pointOf(ring[index]);
    const b = pointOf(ring[previous]);
    if (segmentDistance(point, a, b) < EPSILON) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function insideWalkable(point, walkable) {
  return walkable.some((polygon) => insideRing(point, polygon[0]) && !polygon.slice(1).some((hole) => insideRing(point, hole)));
}

function overlapRing(point, radius, ring) {
  if (!nearRing(point, ring, radius)) return false;
  return insideRing(point, ring) || ring.some((vertex, index) => segmentDistance(point, pointOf(vertex), pointOf(ring[(index + 1) % ring.length])) < radius - EPSILON);
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function edgeCrossings(from, to, a, b) {
  const delta = { x: to.x - from.x, y: to.y - from.y };
  const edge = { x: b.x - a.x, y: b.y - a.y };
  const offset = { x: a.x - from.x, y: a.y - from.y };
  const determinant = cross(delta, edge);
  if (Math.abs(determinant) < EPSILON) {
    if (Math.abs(cross(offset, delta)) >= EPSILON) return [];
    const lengthSquared = delta.x * delta.x + delta.y * delta.y;
    if (lengthSquared < EPSILON) return [];
    return [a, b].map((endpoint) => ((endpoint.x - from.x) * delta.x + (endpoint.y - from.y) * delta.y) / lengthSquared).filter((fraction) => fraction >= 0 && fraction <= 1);
  }
  const fraction = cross(offset, edge) / determinant;
  const edgeFraction = cross(offset, delta) / determinant;
  return fraction >= -EPSILON && fraction <= 1 + EPSILON && edgeFraction >= -EPSILON && edgeFraction <= 1 + EPSILON ? [clamp(fraction, 0, 1)] : [];
}

/** Static floor boundaries are spatially indexed; an A* edge is < 1m long. */
function floorIndex(walkable) {
  if (floorIndexCache.has(walkable)) return floorIndexCache.get(walkable);
  const size = 2;
  const buckets = new Map();
  const edges = [];
  for (const polygon of walkable) for (const ring of polygon) for (let index = 0; index < ring.length; index++) {
    const a = pointOf(ring[index]);
    const b = pointOf(ring[(index + 1) % ring.length]);
    const id = edges.length;
    edges.push({ a, b });
    for (let x = Math.floor(Math.min(a.x, b.x) / size); x <= Math.floor(Math.max(a.x, b.x) / size); x++) for (let y = Math.floor(Math.min(a.y, b.y) / size); y <= Math.floor(Math.max(a.y, b.y) / size); y++) {
      const key = `${x}:${y}`;
      const entries = buckets.get(key) ?? [];
      entries.push(id);
      buckets.set(key, entries);
    }
  }
  const result = {
    query(from, to) {
      const minX = Math.floor(Math.min(from.x, to.x) / size);
      const maxX = Math.floor(Math.max(from.x, to.x) / size);
      const minY = Math.floor(Math.min(from.y, to.y) / size);
      const maxY = Math.floor(Math.max(from.y, to.y) / size);
      if ((maxX - minX + 1) * (maxY - minY + 1) > 64) return edges;
      const ids = new Set();
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (const id of buckets.get(`${x}:${y}`) ?? []) ids.add(id);
      return [...ids].map((id) => edges[id]);
    },
  };
  floorIndexCache.set(walkable, result);
  return result;
}

/** Fractions where a finite segment intersects a ring, including collinear edges. */
function ringCrossings(from, to, ring) {
  if (!nearSegment(from, to, ring)) return [];
  const fractions = [];
  for (let index = 0; index < ring.length; index++) {
    const a = pointOf(ring[index]);
    const b = pointOf(ring[(index + 1) % ring.length]);
    fractions.push(...edgeCrossings(from, to, a, b));
  }
  return fractions;
}

function pointAlong(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function insideIntervals(from, to, ring) {
  const fractions = [0, ...ringCrossings(from, to, ring), 1].sort((a, b) => a - b);
  const intervals = [];
  for (let index = 1; index < fractions.length; index++) {
    if (fractions[index] - fractions[index - 1] > EPSILON && insideRing(pointAlong(from, to, (fractions[index] + fractions[index - 1]) / 2), ring)) intervals.push([fractions[index - 1], fractions[index]]);
  }
  return intervals;
}

function withinFloor(from, to, walkable) {
  const crossings = [0, 1];
  for (const { a, b } of floorIndex(walkable).query(from, to)) crossings.push(...edgeCrossings(from, to, a, b));
  crossings.sort((a, b) => a - b);
  if (!insideWalkable(from, walkable) || !insideWalkable(to, walkable)) return false;
  for (let index = 1; index < crossings.length; index++) {
    if (crossings[index] - crossings[index - 1] > EPSILON && !insideWalkable(pointAlong(from, to, (crossings[index] + crossings[index - 1]) / 2), walkable)) return false;
  }
  return true;
}

/**
 * Exact horizontal occlusion, with height interpolation along the ray.
 * Tall structures represented by a floor gap also occlude the ray. A low crate
 * blocks legs, but not an eye-height ray that passes above its top.
 */
export function segmentClear(from, to, {
  walkable = [],
  obstacles = [],
  radius = 0,
  fromHeight = from.feetHeight ?? 1.35,
  toHeight = to.feetHeight ?? fromHeight,
  checkFloor = true,
} = {}) {
  if (!from || !to || ![from.x, from.y, to.x, to.y, fromHeight, toHeight].every(Number.isFinite)) return false;
  if (checkFloor && walkable.length && !withinFloor(from, to, walkable)) return false;
  if (radius > 0 && checkFloor && walkable.length) {
    const count = Math.max(1, Math.ceil(distance(from, to) / 0.18));
    for (let index = 0; index <= count; index++) {
      const point = pointAlong(from, to, index / count);
      for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) if (!insideWalkable({ x: point.x + dx, y: point.y + dy }, walkable)) return false;
    }
  }
  for (const obstacle of obstacles) {
    const ring = obstacle.ring ?? obstacle;
    if (!nearSegment(from, to, ring, radius)) continue;
    const top = obstacle.top ?? Infinity;
    const base = obstacle.base ?? 0;
    for (const [entry, exit] of insideIntervals(from, to, ring)) {
      const entryHeight = fromHeight + (toHeight - fromHeight) * entry;
      const exitHeight = fromHeight + (toHeight - fromHeight) * exit;
      if (Math.min(entryHeight, exitHeight) < top - 0.035 && Math.max(entryHeight, exitHeight) >= base - 0.035) return false;
    }
    if (radius > 0 && Math.min(fromHeight, toHeight) < top - 0.035) {
      // Check the swept body at short intervals; corner clearance matters even
      // when the centre line does not enter the polygon.
      const count = Math.max(1, Math.ceil(distance(from, to) / Math.max(radius * 0.65, 0.08)));
      for (let index = 0; index <= count; index++) {
        const fraction = index / count;
        const height = fromHeight + (toHeight - fromHeight) * fraction;
        if (height < top - 0.035 && height >= base - 0.035 && overlapRing(pointAlong(from, to, fraction), radius, ring)) return false;
      }
    }
  }
  return true;
}

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].score <= item.score) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (items.length) {
      let index = 0;
      while (index * 2 + 1 < items.length) {
        let child = index * 2 + 1;
        if (child + 1 < items.length && items[child + 1].score < items[child].score) child++;
        if (items[child].score >= last.score) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
  get length() { return this.items.length; }
}

/** Cached, bounded A* grid with extra nodes through narrow door openings. */
export function createNavigation({
  walkable = [], obstacles = [], sightObstacles = [], canStand, portals = [],
  radius = AI_CONSTANTS.radius, cellSize = AI_CONSTANTS.cellSize,
  maxNodes = AI_CONSTANTS.maxNodes, maxJumpHeight = AI_CONSTANTS.maxJumpHeight,
} = {}) {
  const vertices = walkable.flatMap((polygon) => polygon[0]).map(pointOf);
  const bounds = vertices.length ? {
    minX: Math.min(...vertices.map((point) => point.x)), minY: Math.min(...vertices.map((point) => point.y)),
    maxX: Math.max(...vertices.map((point) => point.x)), maxY: Math.max(...vertices.map((point) => point.y)),
  } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
  const portalBudget = Math.min(300, Math.floor(maxNodes * 0.15));
  let resolution = Math.max(cellSize, Math.sqrt(area / Math.max(64, maxNodes - portalBudget)));
  // Rounding the two grid dimensions can otherwise exceed the node budget.
  while (Math.ceil((bounds.maxX - bounds.minX) / resolution) * Math.ceil((bounds.maxY - bounds.minY) / resolution) > Math.max(64, maxNodes - portalBudget)) resolution *= 1.015;
  const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / resolution));
  const rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / resolution));
  const cellCache = new Map();
  const edgeCache = new Map();
  const portalNodes = [];
  const portalLinks = new Map();
  let revision = 0;
  let queryObstacles = null;
  let lastVisited = 0;
  let searchCredits = Infinity;
  let searchDeferred = false;
  let searchDeadline = Infinity;
  const pendingSearches = new Map();
  const obstacleList = () => queryObstacles ?? (typeof obstacles === "function" ? obstacles() : obstacles);

  function stand(point, feetHeight = 0) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    for (const [dx, dy] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius * 0.71, radius * 0.71], [-radius * 0.71, radius * 0.71], [radius * 0.71, -radius * 0.71], [-radius * 0.71, -radius * 0.71]]) {
      if (!insideWalkable({ x: point.x + dx, y: point.y + dy }, walkable)) return false;
    }
    if (canStand && !canStand(point.x, point.y, radius, feetHeight)) return false;
    return !obstacleList().some((obstacle) => feetHeight < (obstacle.top ?? Infinity) - 0.035 && overlapRing(point, radius, obstacle.ring ?? obstacle));
  }

  function supportHeight(point) {
    return obstacleList().reduce((height, obstacle) => overlapRing(point, radius, obstacle.ring ?? obstacle) ? Math.max(height, obstacle.top ?? Infinity) : height, 0);
  }

  function nodePosition(id) {
    if (id >= columns * rows) return portalNodes[id - columns * rows];
    return { x: bounds.minX + (id % columns + 0.5) * resolution, y: bounds.minY + (Math.floor(id / columns) + 0.5) * resolution };
  }

  function node(id, allowJump) {
    const key = `${id}:${allowJump ? 1 : 0}`;
    if (cellCache.has(key)) return cellCache.get(key);
    const point = nodePosition(id);
    let result = null;
    if (point && stand(point)) result = { ...point, id, feetHeight: 0 };
    else if (point && allowJump) {
      const height = supportHeight(point);
      if (height > 0 && height <= maxJumpHeight && stand(point, height + 0.04)) result = { ...point, id, feetHeight: height };
    }
    cellCache.set(key, result);
    return result;
  }

  function gridIdsNear(point, cells = 2) {
    const column = Math.floor((point.x - bounds.minX) / resolution);
    const row = Math.floor((point.y - bounds.minY) / resolution);
    const ids = [];
    for (let y = Math.max(0, row - cells); y <= Math.min(rows - 1, row + cells); y++) for (let x = Math.max(0, column - cells); x <= Math.min(columns - 1, column + cells); x++) ids.push(y * columns + x);
    return ids;
  }

  // Three anchors per portal cover the doorway itself and both adjacent rooms.
  // They avoid a grid cell missing the tiny usable band of a narrow doorway.
  for (const portal of portals) {
    if (portalNodes.length >= portalBudget - 2) break;
    if (portal.start && portal.end) {
      const start = pointOf(portal.start);
      const end = pointOf(portal.end);
      const width = distance(start, end);
      if (width < radius * 2 + 0.02) continue;
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const normal = { x: -(end.y - start.y) / width, y: (end.x - start.x) / width };
      const baseId = columns * rows + portalNodes.length;
      for (const offset of [-resolution * 1.4, 0, resolution * 1.4]) portalNodes.push({ x: center.x + normal.x * offset, y: center.y + normal.y * offset });
      portalLinks.set(baseId, [baseId + 1]);
      portalLinks.set(baseId + 1, [baseId, baseId + 2]);
      portalLinks.set(baseId + 2, [baseId + 1]);
    } else if (Number.isFinite(portal.x) && Number.isFinite(portal.y)) portalNodes.push(copyPoint(portal));
  }
  for (let index = 0; index < portalNodes.length; index++) {
    const id = columns * rows + index;
    const ids = portalLinks.get(id) ?? [];
    ids.push(...gridIdsNear(portalNodes[index], 2));
    portalLinks.set(id, ids);
    for (const other of ids.filter((value) => value < columns * rows)) {
      const links = portalLinks.get(other) ?? [];
      links.push(id);
      portalLinks.set(other, links);
    }
  }

  function clear(from, to, options = {}) {
    const extra = (options.radius ?? 0) === 0 ? (typeof sightObstacles === "function" ? sightObstacles() : sightObstacles) : [];
    const blockers = extra.length ? [...obstacleList(), ...extra] : obstacleList();
    return segmentClear(from, to, { walkable, obstacles: blockers, ...options });
  }

  function edgeClear(from, to) {
    const key = from.id < to.id ? `${from.id}:${to.id}` : `${to.id}:${from.id}`;
    if (edgeCache.has(key)) return edgeCache.get(key);
    const height = Math.max(from.feetHeight, to.feetHeight) + 0.04;
    const result = Math.abs(from.feetHeight - to.feetHeight) <= maxJumpHeight && clear(from, to, { radius, fromHeight: height, toHeight: height });
    edgeCache.set(key, result);
    return result;
  }

  function neighbors(id) {
    const ids = [...(portalLinks.get(id) ?? [])];
    if (id < columns * rows) {
      const column = id % columns;
      const row = Math.floor(id / columns);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const x = column + dx;
        const y = row + dy;
        if (x >= 0 && x < columns && y >= 0 && y < rows) ids.push(y * columns + x);
      }
    }
    return ids;
  }

  function connector(point, allowJump) {
    const candidates = [...gridIdsNear(point, 2), ...portalNodes.map((_, index) => columns * rows + index).filter((id) => distance(point, nodePosition(id)) < resolution * 2.8)];
    return candidates.map((id) => node(id, allowJump)).filter(Boolean).sort((a, b) => distance(a, point) - distance(b, point)).find((candidate) => clear(point, candidate, { radius, fromHeight: Math.max(point.feetHeight ?? 0, candidate.feetHeight) + 0.04, toHeight: Math.max(point.feetHeight ?? 0, candidate.feetHeight) + 0.04 }));
  }

  function simplify(path) {
    if (path.length < 3) return path;
    const simplified = [path[0]];
    let index = 0;
    while (index < path.length - 1) {
      let next = Math.min(path.length - 1, index + 9);
      while (next > index + 1) {
        // Preserve ascent and landing nodes; smoothing must not remove a jump.
        const height = path[index].feetHeight ?? 0;
        const level = path.slice(index, next + 1).every((point) => (point.feetHeight ?? 0) === height);
        if (level && clear(path[index], path[next], { radius, fromHeight: height + 0.04, toHeight: height + 0.04 })) break;
        next--;
      }
      simplified.push(path[next]);
      index = next;
    }
    return simplified;
  }

  const navigation = {
    bounds, cellSize: resolution, radius,
    get revision() { return revision; },
    get stats() { return { nodes: columns * rows + portalNodes.length, cachedNodes: cellCache.size, cachedEdges: edgeCache.size, lastVisited, searchDeferred }; },
    canStand: stand,
    segmentClear: clear,
    supportHeight,
    /** Optional scene budget: reset once per frame before updating all NPCs. */
    beginFrame(maxSearches = 2, maxMilliseconds = Infinity) {
      searchCredits = Math.max(0, maxSearches);
      searchDeadline = Number.isFinite(maxMilliseconds) ? performance.now() + Math.max(0.1, maxMilliseconds) : Infinity;
    },
    invalidate() {
      revision++;
      cellCache.clear(); edgeCache.clear(); pendingSearches.clear();
      // Callers normally replace footprints, but edits in place are supported
      // when the explicit invalidation hook is used.
      for (const obstacle of obstacleList()) ringBoundsCache.delete(obstacle.ring ?? obstacle);
    },
    findPath(from, to, { allowJump = true, maxVisited = AI_CONSTANTS.maxVisited } = {}) {
      lastVisited = 0;
      searchDeferred = false;
      queryObstacles = typeof obstacles === "function" ? obstacles() : obstacles;
      try {
        if (!from || !to || !stand(from, from.feetHeight ?? 0)) return [];
        let destination = copyPoint(to);
        if (!stand(destination, destination.feetHeight ?? 0)) {
          const reachable = connector(destination, allowJump);
          if (!reachable || distance(reachable, destination) > resolution * 2) return [];
          destination = copyPoint(reachable);
        }
        if (clear(from, destination, { radius, fromHeight: (from.feetHeight ?? 0) + 0.04, toHeight: (destination.feetHeight ?? 0) + 0.04 })) return [copyPoint(destination)];
        if (searchCredits <= 0) { searchDeferred = true; return []; }
        searchCredits--;
        const start = connector(from, allowJump);
        const goal = connector(destination, allowJump);
        if (!start || !goal) return [];
        const searchKey = `${start.id}:${goal.id}:${allowJump ? 1 : 0}`;
        let search = pendingSearches.get(searchKey);
        if (!search) {
          const open = new MinHeap();
          open.push({ id: start.id, score: distance(start, goal), cost: 0 });
          search = { open, costs: new Map([[start.id, 0]]), previous: new Map(), closed: new Set(), visited: 0 };
          // Bound memory even if a moving target makes several goals obsolete.
          if (pendingSearches.size >= 24) pendingSearches.delete(pendingSearches.keys().next().value);
        }
        const { open, costs, previous, closed } = search;
        let found = false;
        const visitLimit = Math.max(1, Math.min(maxVisited, columns * rows + portalNodes.length));
        while (open.length && search.visited < visitLimit) {
          if (lastVisited > 0 && lastVisited % 8 === 0 && performance.now() >= searchDeadline) {
            pendingSearches.set(searchKey, search);
            searchDeferred = true;
            return [];
          }
          const entry = open.pop();
          if (closed.has(entry.id) || entry.cost !== costs.get(entry.id)) continue;
          closed.add(entry.id);
          lastVisited++;
          search.visited++;
          if (entry.id === goal.id) { found = true; break; }
          const current = node(entry.id, allowJump);
          for (const id of neighbors(entry.id)) {
            if (closed.has(id)) continue;
            const candidate = node(id, allowJump);
            if (!candidate || !edgeClear(current, candidate)) continue;
            const jumpCost = candidate.feetHeight > current.feetHeight + 0.05 ? 2.1 : 0;
            const cost = entry.cost + distance(current, candidate) + jumpCost;
            if (cost >= (costs.get(id) ?? Infinity)) continue;
            costs.set(id, cost);
            previous.set(id, entry.id);
            open.push({ id, cost, score: cost + distance(candidate, goal) });
          }
        }
        pendingSearches.delete(searchKey);
        if (!found) return [];
        const path = [copyPoint(destination)];
        for (let id = goal.id; id != null; id = previous.get(id)) path.unshift(copyPoint(node(id, allowJump)));
        path.unshift(copyPoint(from));
        const result = simplify(path).slice(1);
        return result.filter((point, index) => index === 0 || distance(point, result[index - 1]) > 0.025);
      } finally { queryObstacles = null; }
    },
    jumpPlan(from, to) {
      const startHeight = from.feetHeight ?? 0;
      const landingHeight = to.feetHeight ?? supportHeight(to);
      const obstructionHeight = obstacleList().reduce((height, obstacle) => {
        const touches = insideIntervals(from, to, obstacle.ring ?? obstacle).length > 0 || overlapRing(to, radius, obstacle.ring ?? obstacle);
        return touches ? Math.max(height, obstacle.top ?? Infinity) : height;
      }, landingHeight);
      const requiredHeight = obstructionHeight - startHeight;
      const required = requiredHeight > 0.09;
      if (!required) return { required: false, clear: clear(from, to, { radius, fromHeight: startHeight + 0.04, toHeight: startHeight + 0.04 }), height: 0, velocity: 0, landing: copyPoint(to) };
      const clearLanding = stand(to, landingHeight + 0.04);
      const safe = requiredHeight <= maxJumpHeight && distance(from, to) <= 2.6 && clearLanding && clear(from, to, { radius, fromHeight: obstructionHeight + 0.045, toHeight: obstructionHeight + 0.045 });
      return { required, clear: safe, height: Math.max(0, requiredHeight), velocity: AI_CONSTANTS.jumpVelocity, landing: { ...copyPoint(to), feetHeight: landingHeight } };
    },
    randomPoint(random = Math.random, origin = null, maxDistance = Infinity) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = node(Math.min(columns * rows - 1, Math.floor(clamp(random(), 0, 0.999999) * columns * rows)), false);
        if (candidate && (!origin || distance(candidate, origin) < maxDistance)) return copyPoint(candidate);
      }
      if (origin && stand(origin)) return copyPoint(origin);
      return null;
    },
  };
  return navigation;
}

function seededRandom(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function createEnemyState({ id = "enemy", team = 0, seed = 1, reactionSeconds = AI_CONSTANTS.reactionSeconds, sightRange = AI_CONSTANTS.sightRange } = {}) {
  return {
    id, team, seed: seed >>> 0 || 1, mode: "patrol", time: 0,
    targetId: null, memory: null, reactionLeft: 0, reactionSeconds,
    sightRange, senseTimer: (seed % 13) * 0.011, cooldown: 0,
    strafeDirection: seed % 2 ? 1 : -1, strafeTimer: 0,
    path: [], pathGoal: null, pathRevision: -1, repathTimer: 0,
    patrolGoal: null, retreatUntil: 0, nextRetreatAt: 0,
    jumpCooldown: 0, heading: null,
  };
}

function facingTarget(position, target, heading) {
  if (heading == null || distance(position, target) < 4) return true;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  // Heading follows the scene convention: atan2(dx, dy).
  return (Math.sin(heading) * dx + Math.cos(heading) * dy) / (Math.hypot(dx, dy) || 1) > -0.28;
}

function chooseVisibleTarget(state, context) {
  const { position, entities = [], navigation, mode = "survival" } = context;
  const feet = position.feetHeight ?? 0;
  let best = null;
  let bestScore = Infinity;
  for (const entity of entities) {
    if (entity.id === state.id || entity.alive === false || entity.dead || (!entity.player && entity.team === state.team) || entity.hostile === false) continue;
    if (!entity.player && mode === "survival" && entities.some((candidate) => candidate.player && candidate.alive !== false)) continue;
    const separation = distance(position, entity.position);
    if (separation > state.sightRange || !facingTarget(position, entity.position, context.heading ?? state.heading)) continue;
    const visible = navigation.segmentClear(position, entity.position, { fromHeight: feet + 1.35, toHeight: (entity.feetHeight ?? entity.position.feetHeight ?? 0) + 1.1 });
    if (!visible) continue;
    const score = separation + (entity.player ? -9 : 0) + (entity.id === state.targetId ? -3 : 0);
    if (score < bestScore) { bestScore = score; best = entity; }
  }
  return best;
}

function localDestination(origin, wanted, navigation) {
  if (navigation.canStand(wanted, origin.feetHeight ?? 0) && navigation.segmentClear(origin, wanted, { radius: navigation.radius, fromHeight: (origin.feetHeight ?? 0) + 0.04, toHeight: (origin.feetHeight ?? 0) + 0.04 })) return wanted;
  for (const scale of [0.65, 0.35]) {
    const candidate = { x: origin.x + (wanted.x - origin.x) * scale, y: origin.y + (wanted.y - origin.y) * scale };
    if (navigation.canStand(candidate, origin.feetHeight ?? 0) && navigation.segmentClear(origin, candidate, { radius: navigation.radius, fromHeight: (origin.feetHeight ?? 0) + 0.04, toHeight: (origin.feetHeight ?? 0) + 0.04 })) return candidate;
  }
  return null;
}

function pathDestination(state, origin, goal, navigation) {
  if (!goal) { state.path = []; return null; }
  const height = origin.feetHeight ?? 0;
  if (navigation.segmentClear(origin, goal, { radius: navigation.radius, fromHeight: height + 0.04, toHeight: (goal.feetHeight ?? 0) + 0.04 }) && navigation.canStand(goal, goal.feetHeight ?? 0)) {
    state.path = [];
    state.pathGoal = copyPoint(goal);
    return goal;
  }
  const movedGoal = !state.pathGoal || distance(state.pathGoal, goal) > 1.3;
  if (state.repathTimer <= 0 || state.pathRevision !== navigation.revision || movedGoal) {
    const newPath = navigation.findPath(origin, goal);
    if (!navigation.stats.searchDeferred) state.path = newPath;
    state.pathGoal = copyPoint(goal);
    state.pathRevision = navigation.revision;
    state.repathTimer = navigation.stats.searchDeferred ? 0.055 : AI_CONSTANTS.repathSeconds + seededRandom(state) * 0.28;
  }
  while (state.path.length && distance(origin, state.path[0]) < 0.22 && Math.abs(height - (state.path[0].feetHeight ?? 0)) < 0.2) state.path.shift();
  if (!state.path.length) return null;
  const next = state.path[0];
  const plan = navigation.jumpPlan(origin, next);
  const clear = navigation.segmentClear(origin, next, { radius: navigation.radius, fromHeight: height + 0.04, toHeight: Math.max(height, next.feetHeight ?? 0) + 0.04 });
  if (!clear && !(plan.required && plan.clear)) { state.repathTimer = 0; return null; }
  return next;
}

/**
 * Pure decision step. Returns a new state and a scene-independent action.
 * Memory always contains a last *observed* position. A hidden entity's current
 * position is never used for pursuit or attacking.
 */
export function decideEnemy(previous, context, delta) {
  const dt = clamp(Number(delta) || 0, 0, 0.25);
  const state = { ...previous, memory: previous.memory ? { ...previous.memory, position: copyPoint(previous.memory.position) } : null, path: [...previous.path] };
  const action = { mode: "patrol", destination: null, lookAt: null, targetId: null, attack: false, jump: false, jumpVelocity: AI_CONSTANTS.jumpVelocity, speedMultiplier: 0.58 };
  if (!context.position || !context.navigation || context.alive === false || context.health <= 0) return { state: { ...state, mode: "dead" }, action: { ...action, mode: "dead", speedMultiplier: 0 } };
  const { position, navigation, entities = [], weapon = {} } = context;
  state.time += dt;
  for (const key of ["senseTimer", "cooldown", "strafeTimer", "repathTimer", "jumpCooldown"]) state[key] = Math.max(0, state[key] - dt);
  if (state.memory && state.memory.expires <= state.time) { state.memory = null; state.targetId = null; }

  if (state.senseTimer <= 0) {
    const detected = chooseVisibleTarget(state, context);
    state.senseTimer = 0.14 + seededRandom(state) * 0.075;
    if (detected) {
      if (detected.id !== state.targetId) state.reactionLeft = state.reactionSeconds;
      state.targetId = detected.id;
      state.memory = { id: detected.id, position: copyPoint(detected.position), expires: state.time + AI_CONSTANTS.memorySeconds, seenAt: state.time, player: Boolean(detected.player) };
    }
  }
  const entity = state.targetId != null ? entities.find((candidate) => candidate.id === state.targetId && candidate.alive !== false && !candidate.dead) : null;
  if (state.targetId != null && entities.some((candidate) => candidate.id === state.targetId && (candidate.dead || candidate.alive === false))) { state.targetId = null; state.memory = null; }
  let visible = false;
  if (entity && distance(position, entity.position) <= state.sightRange) {
    visible = navigation.segmentClear(position, entity.position, { fromHeight: (position.feetHeight ?? 0) + 1.35, toHeight: (entity.feetHeight ?? entity.position.feetHeight ?? 0) + 1.1 });
    if (visible) {
      state.memory = { id: entity.id, position: copyPoint(entity.position), expires: state.time + AI_CONSTANTS.memorySeconds, seenAt: state.time, player: Boolean(entity.player) };
      state.reactionLeft = Math.max(0, state.reactionLeft - dt);
    }
  }
  if (!state.memory && !visible) {
    const heard = (context.noises ?? []).filter((noise) => noise.sourceId !== state.id && (noise.age ?? 0) < AI_CONSTANTS.hearingSeconds && distance(position, noise.position) < (noise.radius ?? 12)).sort((a, b) => (a.age ?? 0) - (b.age ?? 0))[0];
    if (heard) state.memory = { id: null, position: copyPoint(heard.position), expires: state.time + 3, seenAt: -Infinity, player: false };
  }

  let goal = null;
  if (state.memory) {
    const targetPosition = state.memory.position;
    const separation = distance(position, targetPosition);
    action.lookAt = copyPoint(targetPosition);
    action.targetId = state.memory.id;
    state.heading = Math.atan2(targetPosition.x - position.x, targetPosition.y - position.y);
    const direction = { x: (targetPosition.x - position.x) / Math.max(separation, 0.01), y: (targetPosition.y - position.y) / Math.max(separation, 0.01) };
    const lateral = { x: -direction.y, y: direction.x };
    const idealRange = weapon.idealRange ?? (weapon.ranged ? 8 : 0.9);
    const minimumRange = weapon.minRange ?? (weapon.ranged ? idealRange * 0.48 : 0);
    const reach = weapon.reach ?? (weapon.ranged ? 18 : 1.05);
    if (state.strafeTimer <= 0) { state.strafeDirection *= -1; state.strafeTimer = 1.1 + seededRandom(state) * 1.8; }
    const healthRatio = (context.health ?? 100) / Math.max(1, context.maxHealth ?? 100);
    if (visible && healthRatio < 0.3 && state.time >= state.nextRetreatAt && separation < idealRange + 3) {
      state.retreatUntil = state.time + 1.6;
      state.nextRetreatAt = state.time + 5;
    }
    if (!visible) {
      action.mode = state.memory.id == null ? "investigate" : "pursue";
      action.speedMultiplier = 1.06;
      goal = targetPosition;
      if (separation < 0.65 && state.time - state.memory.seenAt > 0.45) { state.memory = null; state.targetId = null; state.patrolGoal = null; goal = null; }
    } else if ((weapon.ranged && separation < minimumRange) || state.time < state.retreatUntil) {
      action.mode = "retreat";
      action.speedMultiplier = 1.12;
      goal = localDestination(position, { x: position.x - direction.x * 2.4 + lateral.x * state.strafeDirection * 0.65, y: position.y - direction.y * 2.4 + lateral.y * state.strafeDirection * 0.65 }, navigation);
      if (!goal) {
        state.strafeDirection *= -1;
        goal = localDestination(position, { x: position.x + lateral.x * state.strafeDirection * 1.5, y: position.y + lateral.y * state.strafeDirection * 1.5 }, navigation);
      }
    } else if (separation > idealRange + (weapon.ranged ? 1.1 : 0.12)) {
      action.mode = "pursue";
      action.speedMultiplier = 1.03;
      goal = { x: targetPosition.x - direction.x * idealRange * 0.82, y: targetPosition.y - direction.y * idealRange * 0.82 };
    } else if (weapon.ranged) {
      action.mode = "strafe";
      action.speedMultiplier = 0.74;
      goal = localDestination(position, { x: position.x + lateral.x * state.strafeDirection * 1.35, y: position.y + lateral.y * state.strafeDirection * 1.35 }, navigation);
      if (!goal) state.strafeDirection *= -1;
    } else {
      action.mode = "attack";
      action.speedMultiplier = 0.38;
    }
    if (visible && state.reactionLeft <= 0 && separation <= reach && state.cooldown <= 0) {
      action.attack = true;
      state.cooldown = Math.max(0.12, weapon.cooldown ?? 0.8) * (0.94 + seededRandom(state) * 0.14);
    }
  } else {
    action.mode = "patrol";
    if (!state.patrolGoal || distance(position, state.patrolGoal) < 0.5) state.patrolGoal = navigation.randomPoint(() => seededRandom(state), position, 9);
    goal = state.patrolGoal;
    if (goal) { action.lookAt = copyPoint(goal); state.heading = Math.atan2(goal.x - position.x, goal.y - position.y); }
  }

  action.destination = pathDestination(state, position, goal, navigation);
  if (!action.destination && action.mode === "patrol") state.patrolGoal = null;
  if (action.destination) {
    // Soft separation keeps companions from occupying a doorway together. The
    // offset is accepted only when the swept body remains inside the arena.
    let pushX = 0;
    let pushY = 0;
    for (const teammate of entities) {
      if (teammate.id === state.id || teammate.player || teammate.alive === false || teammate.team !== state.team) continue;
      const gap = distance(position, teammate.position);
      if (gap <= 0.001 || gap > 0.72) continue;
      const strength = (0.72 - gap) * 0.8;
      pushX += (position.x - teammate.position.x) / gap * strength;
      pushY += (position.y - teammate.position.y) / gap * strength;
    }
    if (Math.hypot(pushX, pushY) > 0.01) {
      const separated = localDestination(position, { x: action.destination.x + pushX, y: action.destination.y + pushY }, navigation);
      if (separated) action.destination = separated;
    }
    if (state.jumpCooldown <= 0 && (position.feetHeight ?? 0) < 0.05) {
      const plan = navigation.jumpPlan(position, action.destination);
      if (plan.required && plan.clear) { action.jump = true; state.jumpCooldown = 1.25; }
    }
  }
  state.mode = action.mode;
  return { state, action };
}

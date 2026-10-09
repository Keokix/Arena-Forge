import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { ARENA_STYLES, createSeededRandom, generateRandomMap } from '../js/random-map.js';
import { parseArenaData } from '../js/arena-parser.js';
import { buildArenaRows } from '../js/arena-geometry.js';
import { createFurniture, CREATIVE_CATALOG } from '../js/furniture.js';

const styles = Object.keys(ARENA_STYLES).filter((style) => style !== 'random');
const bounds = (points) => {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const inside = (point, area, padding = 0) => point.x > area.x + padding && point.y > area.y + padding && point.x < area.x + area.w - padding && point.y < area.y + area.h - padding;
const intersects = (a,b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('A seed reproduces the complete map while different seeds change geometry', () => {
  const config = { style: 'random', mapSize: 'large', roomCount: 7, seed: 'ironworks-17' };
  const first = generateRandomMap(() => .1, config);
  assert.equal(first, generateRandomMap(() => .9, config));
  assert.notEqual(first, generateRandomMap(Math.random, { ...config, seed: 'ironworks-18' }));
  const a = createSeededRandom('test'), b = createSeededRandom('test');
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
});

test('Every layout has finite geometry, two exits per room and unblocked loot pockets', () => {
  for (const style of styles) for (const mapSize of ['small','medium','large']) {
    const arena = parseArenaData(generateRandomMap(Math.random, { style, mapSize, roomCount: 10, seed: 'layout-check' }));
    assert.equal(arena.spaces.length - 1, 10, `${style}/${mapSize} room count`);
    assert.ok(arena.planObjects.length >= 12, `${style}/${mapSize} cover`);
    assert.ok(buildArenaRows(arena).every((row) => row.geometry.flat(2).every((point) => point.every(Number.isFinite))), style);
    for (const room of arena.contourSets.filter((set) => set.id.startsWith('shell-'))) {
      const exits = arena.openings.filter((opening) => opening.contourRef === room.outer.id);
      assert.ok(exits.length >= 2, `${style}: ${room.id} lacks a flank exit`);
      for (const opening of exits) {
        assert.ok(opening.alignment.distance < .02, `${style}: door alignment`);
        const passage = bounds(arena.doorPassages.find((passage) => passage.id === opening.id).points);
        for (const prop of arena.planObjects) assert.ok(!intersects(passage,bounds(prop.corners)), `${style}: ${prop.id} blocks ${opening.id}`);
      }
    }
    assert.ok(arena.gameMetadata?.spawn, `${style}: safe spawn metadata`);
    for (const pocket of arena.gameMetadata.loot) {
      const footprint = { x: pocket.x - .42, y: pocket.y - .42, w: .84, h: .84 };
      for (const prop of arena.planObjects) assert.ok(!intersects(footprint,bounds(prop.corners)), `${style}: loot is inside a prop`);
    }
  }
});

/** Rectangular generator footprints are sampled at player radius, with doors open. */
function reachableMap(arena) {
  const radius = .28, step = .5;
  const perimeter = arena.contourSets.find((set) => set.id === 'perimeter');
  const floor = bounds(perimeter.holes[0].points);
  const rooms = arena.contourSets.filter((set) => set.type === 'shell' && set !== perimeter).map((set) => ({ outer: bounds(set.outer.points), inner: bounds(set.holes[0].points) }));
  const solids = arena.contourSets.filter((set) => set.type === 'solid').map((set) => bounds(set.outer.points));
  const props = arena.planObjects.map((prop) => bounds(prop.corners));
  const passages = arena.doorPassages.map((passage) => bounds(passage.points));
  // Radius samples can straddle a passage and the adjoining room floor.
  const sampleFree = (point) => inside(point,floor) && !solids.some((area) => inside(point,area)) && !rooms.some((room) => inside(point,room.outer) && !inside(point,room.inner) && !passages.some((area) => inside(point,area)));
  const offsets = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius * .71,radius * .71],[-radius * .71,radius * .71],[radius * .71,-radius * .71],[-radius * .71,-radius * .71]];
  const free = (point) => !props.some((area) => inside(point,area,-radius)) && offsets.every(([x,y]) => sampleFree({ x: point.x + x,y: point.y + y }));
  const columns = Math.ceil((floor.x + floor.w) / step), rows = Math.ceil((floor.y + floor.h) / step);
  const cells = new Uint8Array(columns * rows), visited = new Uint8Array(cells.length);
  const pointFor = (id) => ({ x: (id % columns) * step + step / 2, y: Math.floor(id / columns) * step + step / 2 });
  for (let id = 0; id < cells.length; id++) cells[id] = free(pointFor(id)) ? 1 : 0;
  const spawn = arena.gameMetadata.spawn;
  let initial = -1, closest = Infinity;
  for (let id = 0; id < cells.length; id++) if (cells[id]) {
    const point = pointFor(id), distance = Math.hypot(point.x - spawn.x,point.y - spawn.y);
    if (distance < closest) { initial = id; closest = distance; }
  }
  assert.ok(closest < step, 'Spawn must stand on free ground');
  const queue = [initial];
  visited[initial] = 1;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index], x = id % columns, y = Math.floor(id / columns);
    const neighbours = [x > 0 ? id - 1 : -1, x + 1 < columns ? id + 1 : -1, y > 0 ? id - columns : -1, y + 1 < rows ? id + columns : -1];
    for (const next of neighbours) if (next >= 0 && cells[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
  }
  return { visited, pointFor, rooms, free };
}

test('Player can reach every room and all spawn anchors in every map style', () => {
  for (const style of styles) for (const mapSize of ['small','large']) for (const seed of ['routes-1','routes-2']) {
    const arena = parseArenaData(generateRandomMap(Math.random, { style, mapSize, roomCount: 8, seed }));
    const reachable = reachableMap(arena);
    for (const [index,room] of reachable.rooms.entries()) assert.ok(reachable.visited.some((visited,id) => visited && inside(reachable.pointFor(id),room.inner,.35)), `${style}/${mapSize}/${seed}: room ${index} disconnected`);
    for (const anchor of [arena.gameMetadata.spawn,...arena.gameMetadata.enemies,...arena.gameMetadata.loot]) assert.ok(reachable.free(anchor), `${style}: blocked gameplay anchor ${JSON.stringify(anchor)}`);
  }
});

test('Furniture has finite bounds and material batching limits draw calls', () => {
  for (const item of CREATIVE_CATALOG) {
    const model = createFurniture({ id: `obj-${item.id}-1`, category: item.category, size: item.size, placement: { x: 0, y: 0, rotation: 90 } },item.height);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    assert.ok(size.toArray().every((value) => Number.isFinite(value) && value > 0), item.id);
    assert.ok(model.children.length <= 6, `${item.id} batches`);
    model.traverse((part) => { part.geometry?.dispose(); part.material?.dispose(); });
  }
});

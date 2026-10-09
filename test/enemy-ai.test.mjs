import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation, createEnemyState, decideEnemy, segmentClear } from '../js/enemy-ai.js';

const rect = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top]];
const room = [[rect(0, 0, 14, 12)]];
const rifle = { ranged: true, idealRange: 8, minRange: 3, reach: 20, cooldown: 0.4 };
const player = (x, y) => ({ id: 'player', player: true, alive: true, position: { x, y } });

test('A* routes around tall cover and each returned segment has body clearance', () => {
  const obstacles = [{ ring: rect(5, 0.1, 8, 8.5), top: 2.5 }];
  const navigation = createNavigation({ walkable: room, obstacles });
  const origin = { x: 2, y: 4 };
  const destination = { x: 11, y: 4 };
  assert.equal(navigation.segmentClear(origin, destination), false);
  const path = navigation.findPath(origin, destination);
  assert.ok(path.length > 2, 'route should use the corridor behind the cover');
  let previous = origin;
  for (const waypoint of path) {
    assert.equal(navigation.canStand(waypoint), true);
    assert.equal(navigation.segmentClear(previous, waypoint, { radius: navigation.radius, fromHeight: 0.04, toHeight: 0.04 }), true);
    previous = waypoint;
  }
  assert.ok(Math.hypot(previous.x - destination.x, previous.y - destination.y) < 0.01);
});

test('Polygon holes and even thin wall gaps prevent line of sight and navigation shortcuts', () => {
  const floors = [[rect(0, 0, 10, 10), rect(4, 0.01, 6, 8.5)]];
  const navigation = createNavigation({ walkable: floors });
  const path = navigation.findPath({ x: 2, y: 3 }, { x: 8, y: 3 });
  assert.ok(path.some((point) => point.y > 8.5));
  assert.equal(navigation.segmentClear({ x: 2, y: 3 }, { x: 8, y: 3 }), false);
  const thinWall = [[rect(0, 0, 4, 10)], [rect(4.06, 0, 10, 10)]];
  assert.equal(segmentClear({ x: 2, y: 3 }, { x: 8, y: 3 }, { walkable: thinWall }), false);
});

test('Door portal anchors cross narrow entrances and closed door revisions invalidate a route', () => {
  let obstacles = [];
  const walkable = [
    [rect(0, 0, 5, 7)],
    [rect(5.15, 0, 10, 7)],
    [rect(4.5, 2.52, 5.65, 3.3)],
  ];
  const navigation = createNavigation({
    walkable, obstacles: () => obstacles,
    portals: [{ start: { x: 5.07, y: 2.52 }, end: { x: 5.07, y: 3.3 } }],
  });
  const from = { x: 2, y: 2.6 };
  const to = { x: 8, y: 2.6 };
  const openPath = navigation.findPath(from, to, { allowJump: false });
  assert.ok(openPath.length);
  obstacles = [{ ring: rect(4.97, 2.5, 5.2, 3.32), top: 2.1 }];
  assert.equal(navigation.segmentClear(from, to), false, 'occlusion must use the live obstacle getter');
  navigation.invalidate();
  assert.deepEqual(navigation.findPath(from, to), []);
  obstacles = [];
  navigation.invalidate();
  assert.ok(navigation.findPath(from, to).length);
});

test('Sight rays pass over low cover, block tall walls and respect target height', () => {
  const from = { x: 1, y: 2 };
  const to = { x: 9, y: 2 };
  const obstacle = { ring: rect(5, 1, 6, 3), top: 0.65 };
  assert.equal(segmentClear(from, to, { obstacles: [obstacle], fromHeight: 1.35, toHeight: 1.1 }), true);
  assert.equal(segmentClear(from, to, { obstacles: [obstacle], fromHeight: 0.1, toHeight: 0.1 }), false);
  assert.equal(segmentClear(from, to, { obstacles: [{ ...obstacle, top: 1.9 }], fromHeight: 1.35, toHeight: 1.1 }), false);
  assert.equal(segmentClear(from, to, { obstacles: [obstacle], fromHeight: 1.35, toHeight: 0.05 }), false);
});

test('Jump planning allows low cover and landing on it, never tall walls or missing floors', () => {
  const navigation = createNavigation({ walkable: room, obstacles: [
    { ring: rect(3.7, 3, 4.35, 5), top: 0.6 },
    { ring: rect(8, 3, 8.5, 5), top: 2.4 },
  ] });
  const low = navigation.jumpPlan({ x: 3.2, y: 4 }, { x: 4.9, y: 4 });
  assert.equal(low.required, true);
  assert.equal(low.clear, true);
  const onto = navigation.jumpPlan({ x: 3.2, y: 4 }, { x: 4.05, y: 4, feetHeight: 0.6 });
  assert.equal(onto.clear, true);
  assert.equal(onto.landing.feetHeight, 0.6);
  const wall = navigation.jumpPlan({ x: 7.5, y: 4 }, { x: 9, y: 4 });
  assert.equal(wall.clear, false);
  assert.equal(navigation.jumpPlan({ x: 13, y: 4 }, { x: 15, y: 4 }).clear, false);
});

test('Perception has a reaction delay and invisible targets cannot be attacked or tracked through walls', () => {
  let obstacles = [];
  const navigation = createNavigation({ walkable: room, obstacles: () => obstacles });
  let state = createEnemyState({ id: 'enemy-1', seed: 2, reactionSeconds: 0.3 });
  const context = { position: { x: 2, y: 4 }, health: 100, weapon: rifle, navigation, entities: [player(8, 4)] };
  let result = decideEnemy(state, context, 0.1);
  assert.equal(result.action.attack, false);
  assert.equal(state.memory, null, 'previous state must remain immutable');
  state = result.state;
  for (let index = 0; index < 4; index++) { result = decideEnemy(state, context, 0.1); state = result.state; }
  assert.ok(state.memory);
  assert.ok(state.cooldown > 0, 'a visible target was attacked after the reaction delay');
  obstacles = [{ ring: rect(5, 0.1, 6, 10), top: 2.3 }];
  navigation.invalidate();
  const hidden = { ...context, entities: [player(10, 8)] };
  for (let index = 0; index < 15; index++) {
    result = decideEnemy(state, hidden, 0.1);
    state = result.state;
    assert.equal(result.action.attack, false);
  }
  assert.deepEqual(state.memory.position, { x: 8, y: 4 });
  assert.equal(result.action.mode, 'pursue');
  assert.deepEqual(result.action.lookAt, { x: 8, y: 4 });
  for (let index = 0; index < 65; index++) { result = decideEnemy(state, { ...hidden, entities: [] }, 0.1); state = result.state; }
  assert.equal(state.memory, null);
  assert.equal(result.action.mode, 'patrol');
});

test('Ranged enemies maintain distance, wounded enemies retreat and survival prioritizes the player', () => {
  const navigation = createNavigation({ walkable: room });
  const context = { position: { x: 5, y: 5 }, health: 100, maxHealth: 100, weapon: rifle, navigation, entities: [
    player(6, 5), { id: 'other', team: 1, position: { x: 4, y: 5 }, alive: true },
  ] };
  let result = decideEnemy(createEnemyState({ id: 'bot', team: 0, seed: 1, reactionSeconds: 0 }), context, 0.1);
  assert.equal(result.action.targetId, 'player');
  assert.equal(result.action.mode, 'retreat');
  assert.ok(result.action.destination.x < 5);
  result = decideEnemy(createEnemyState({ id: 'bot', seed: 1 }), { ...context, health: 20, entities: [player(11, 5)] }, 0.1);
  assert.equal(result.action.mode, 'retreat');
  assert.ok(result.action.destination);
  assert.ok(result.state.retreatUntil > result.state.time);
});

test('Shots and explosions can be investigated without revealing a hidden enemy position', () => {
  const navigation = createNavigation({ walkable: room, obstacles: [{ ring: rect(5, 0, 6, 12), top: 2.3 }] });
  const context = { position: { x: 2, y: 4 }, health: 100, weapon: rifle, navigation, entities: [player(8, 7)], noises: [{ position: { x: 8, y: 5 }, age: 0.2, radius: 15, sourceId: 'player' }] };
  const result = decideEnemy(createEnemyState({ id: 'bot', seed: 1 }), context, 0.1);
  assert.equal(result.action.mode, 'investigate');
  assert.equal(result.action.attack, false);
  assert.deepEqual(result.action.lookAt, { x: 8, y: 5 });
});

test('Path searches have a strict visit budget and empty paths for disconnected arenas', () => {
  const navigation = createNavigation({ walkable: [[rect(0, 0, 25, 50)], [rect(26, 0, 50, 50)]], maxNodes: 6000 });
  assert.deepEqual(navigation.findPath({ x: 1, y: 1 }, { x: 40, y: 40 }, { maxVisited: 60 }), []);
  assert.ok(navigation.stats.lastVisited <= 60);
  assert.ok(navigation.stats.nodes < 6300);
});

test('Per-frame A* budgets defer expensive searches and resume on the next frame', () => {
  const navigation = createNavigation({ walkable: room, obstacles: [{ ring: rect(5, 0.1, 8, 8.5), top: 2.5 }] });
  navigation.beginFrame(1);
  assert.ok(navigation.findPath({ x: 2, y: 4 }, { x: 11, y: 4 }).length);
  assert.deepEqual(navigation.findPath({ x: 2, y: 5 }, { x: 11, y: 5 }), []);
  assert.equal(navigation.stats.searchDeferred, true);
  assert.equal(navigation.stats.lastVisited, 0);
  navigation.beginFrame(1);
  assert.ok(navigation.findPath({ x: 2, y: 5 }, { x: 11, y: 5 }).length);
  assert.equal(navigation.stats.searchDeferred, false);
});

test('Smoke occludes enemy perception while bodies and navigation can cross it', () => {
  let smoke = [{ ring: rect(5, 3, 7, 5), top: 3 }];
  const navigation = createNavigation({ walkable: room, sightObstacles: () => smoke });
  const from = { x: 2, y: 4 };
  const to = { x: 10, y: 4 };
  assert.equal(navigation.segmentClear(from, to), false);
  assert.equal(navigation.canStand({ x: 6, y: 4 }), true);
  assert.ok(navigation.findPath(from, to).length);
  smoke = [];
  assert.equal(navigation.segmentClear(from, to), true);
});

test('Time-sliced A* resumes its frontier instead of restarting every frame', () => {
  const navigation = createNavigation({ walkable: room, obstacles: [{ ring: rect(5, 0.1, 8, 8.5), top: 2.5 }] });
  let path = [];
  let frames = 0;
  do {
    navigation.beginFrame(1, 0.1);
    path = navigation.findPath({ x: 2, y: 4 }, { x: 11, y: 4 });
    frames++;
  } while (navigation.stats.searchDeferred && frames < 200);
  assert.ok(frames > 1, 'the initial search should be distributed across frames');
  assert.ok(frames < 200, 'the retained search frontier must eventually find a route');
  assert.ok(path.length > 2);
  assert.equal(navigation.stats.searchDeferred, false);
});

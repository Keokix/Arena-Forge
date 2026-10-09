import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { generateRandomMap, ARENA_STYLES } from '../js/random-map.js';
import { parseArenaData } from '../js/arena-parser.js';
import { buildArenaRows } from '../js/arena-geometry.js';
import { createModel, createNpc, disposeModel, NPC_WEAPONS, PLAYER_WEAPONS } from '../js/scene.js';

test('Arena generator creates playable maps for every layout style', () => {
  for (const style of Object.keys(ARENA_STYLES).filter((name) => name !== 'random')) {
    const arena = parseArenaData(generateRandomMap(() => 0.42, { style, mapSize: 'large', roomCount: 8 }));
    const rows = buildArenaRows(arena);
    assert.ok(rows.length >= 5, style);
    assert.ok(arena.openings.filter((opening) => opening.category === 'door').length >= 2, style);
    assert.ok(arena.planObjects.length >= 8, style);
  }
});

test('Generated arena creates a finite 3D model', () => {
  const arena = parseArenaData(generateRandomMap(() => 0.61, { style: 'warehouse', mapSize: 'large', roomCount: 8 }));
  const model = createModel(arena, buildArenaRows(arena));
  const size = new Box3().setFromObject(model).getSize(new Vector3());
  assert.ok(size.x > 45 && size.y > 2 && size.z > 30);
  disposeModel(model);
});

test('Combat roster has distinct weapon roles and ammunition rules', () => {
  assert.ok(PLAYER_WEAPONS.length >= 11);
  assert.ok(PLAYER_WEAPONS.some((weapon) => weapon.automatic));
  assert.ok(PLAYER_WEAPONS.some((weapon) => weapon.pellets > 1));
  assert.ok(PLAYER_WEAPONS.filter((weapon) => weapon.ammoCapacity).every((weapon) => weapon.damage > 0 && weapon.cooldown > 0));
  assert.ok(PLAYER_WEAPONS.filter((weapon) => weapon.ammoCapacity).every((weapon) => weapon.reloadTime > 0 && weapon.reserveCapacity >= weapon.ammoCapacity));
});

test('NPCs include a humanoid body, weapon and status display', () => {
  const npc = createNpc(1, () => 0.4);
  assert.equal(npc.group.userData.kind, 'npc');
  assert.ok(npc.weapon.label);
  assert.ok(npc.healthFill.isSprite);
  assert.ok(npc.healthBar.position.y > 2);
});

test('NPC-KI verfügt über Nah- und Fernkampftaktiken', () => {
  assert.ok(NPC_WEAPONS.some((weapon) => weapon.ranged));
  assert.ok(NPC_WEAPONS.some((weapon) => weapon.minRange > 0));
  assert.ok(NPC_WEAPONS.every((weapon) => weapon.idealRange > 0));
});

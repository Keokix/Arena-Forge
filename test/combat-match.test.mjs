import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_WEAPONS, makeWeaponItem, beginReload, tickReload, shotDamage } from '../js/combat.js';
import { Match } from '../js/match.js';

test('magazines consume reserve ammunition and complete reloads atomically', () => {
  const weapon = PLAYER_WEAPONS.find((entry) => entry.id === 'rifle');
  const item = makeWeaponItem(weapon);
  item.ammo = 4;
  assert.equal(beginReload(item), true);
  assert.equal(tickReload(item, weapon.reloadTime / 2), false);
  assert.equal(item.ammo, 4);
  assert.equal(tickReload(item, weapon.reloadTime), true);
  assert.equal(item.ammo, weapon.ammoCapacity);
  assert.equal(item.reserveAmmo, weapon.reserveCapacity - (weapon.ammoCapacity - 4));
});

test('damage falls off with range and headshots remain rewarding', () => {
  const rifle = PLAYER_WEAPONS.find((entry) => entry.id === 'rifle');
  assert.ok(shotDamage(rifle, 5) > shotDamage(rifle, rifle.reach * .95));
  assert.ok(shotDamage(rifle, 10, { headshot: true }) > shotDamage(rifle, 10));
  assert.equal(shotDamage(rifle, rifle.reach + 1), 0);
});

test('survival matches advance five waves and end after the final clear', () => {
  const match = new Match({ mode: 'survival', enemyCount: 4 });
  match.start();
  for (let wave = 1; wave < 5; wave++) {
    assert.equal(match.tick(4.1, 0), 'wave');
    assert.equal(match.wave, wave + 1);
  }
  assert.equal(match.tick(.1, 0), 'victory');
  assert.equal(match.phase, 'victory');
});

test('three player deaths end an active match', () => {
  const match = new Match();
  match.start();
  assert.equal(match.die(), true);
  assert.equal(match.die(), true);
  assert.equal(match.die(), false);
  assert.equal(match.phase, 'defeat');
});

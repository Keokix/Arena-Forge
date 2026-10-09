import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import clipping from "polygon-clipping";
import {
  objectVertical,
  openingVertical,
  OUTDOOR_SLAB_M,
  EYE_HEIGHT_M,
  PLAYER_RADIUS_M,
  WALK_SPEED_M_S,
  SPRINT_MULTIPLIER,
  JUMP_SPEED_M_S,
  GRAVITY_M_S2,
} from "./game-constants.js";
import { createFurniture, CREATIVE_CATALOG } from "./furniture.js";
import { PLAYER_WEAPONS, LOOT_ITEMS, makeWeaponItem, beginReload, tickReload, shotDamage } from './combat.js';
import { Match } from './match.js';
import { createNavigation, createEnemyState, decideEnemy } from './enemy-ai.js';
export { PLAYER_WEAPONS, LOOT_ITEMS } from './combat.js';

export const palette = [
  0x98c9bd, 0xcac0a4, 0xa2bbd5, 0xc3add0, 0xdbc09c, 0xa5c5a5,
];
const ARENA_VISUALS = {
  open: { wall: 0xb5aa8e, outdoor: 0x7d8d70, floors: [0x707866, 0x85806c], door: 0x70513a, sky: 0x91a7b4 },
  rooms: { wall: 0x8795a0, outdoor: 0x65747b, floors: [0x566674, 0x626f7a, 0x4e6068], door: 0x50687a, sky: 0x718896 },
  warehouse: { wall: 0x777f82, outdoor: 0x586469, floors: [0x464e51, 0x555d5f], door: 0x8b623d, sky: 0x748894 },
  lanes: { wall: 0x828d99, outdoor: 0x596d73, floors: [0x496171, 0x625f52, 0x405763], door: 0xa16a37, sky: 0x738a99 },
  courtyard: { wall: 0xc0ad8c, outdoor: 0x7d9272, floors: [0x8c866c, 0x958970], door: 0x76523a, sky: 0x8ea8b3 },
  cross: { wall: 0x989b91, outdoor: 0x68766c, floors: [0x5f6962, 0x6d7066], door: 0x7d583c, sky: 0x81959f },
  maze: { wall: 0x6f7b7d, outdoor: 0x4e5f62, floors: [0x3e4c50, 0x4b5759], door: 0x7a5e43, sky: 0x667a84 },
  outpost: { wall: 0x9b8c70, outdoor: 0x6b755b, floors: [0x665e4e, 0x746a55], door: 0x6b4b35, sky: 0x8d9b9b },
  depot: { wall: 0x74838b, outdoor: 0x515f64, floors: [0x465257, 0x596269], door: 0x9b5d32, sky: 0x6f838d },
};
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function containsWalkable(walkable, x, y) {
  return walkable.some(
    (poly) =>
      pointInRing(x, y, poly[0]) &&
      !poly.slice(1).some((hole) => pointInRing(x, y, hole)),
  );
}
function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length))
    : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
function obstacleRing(obstacle) {
  return obstacle.ring ?? obstacle;
}
function overlapsRing(ring, x, y, radius) {
  return (
    pointInRing(x, y, ring) ||
    ring.some(
      (point, index) =>
        distanceToSegment(x, y, point, ring[(index + 1) % ring.length]) <
        radius,
    )
  );
}
function ringsOverlap(a, b) {
  return Boolean(clipping.intersection([[a]], [[b]])?.length);
}
export function transformedFootprint(object, width, depth) {
  object.updateMatrixWorld(true);
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ].map(([x, z]) => {
    const point = object.localToWorld(new THREE.Vector3(x, 0, z));
    return [point.x, -point.z];
  });
}
export function collidesObstacle(
  obstacles,
  x,
  y,
  radius = PLAYER_RADIUS_M,
  feetHeight = 0,
) {
  return obstacles.some(
    (obstacle) =>
      (obstacle.top == null || feetHeight < obstacle.top - 0.035) &&
      overlapsRing(obstacleRing(obstacle), x, y, radius),
  );
}
export function supportHeightAt(obstacles, x, y, radius = PLAYER_RADIUS_M) {
  return obstacles.reduce(
    (height, obstacle) =>
      obstacle.top != null && overlapsRing(obstacleRing(obstacle), x, y, radius)
        ? Math.max(height, obstacle.top)
        : height,
    0,
  );
}
export function integrateVertical(feetHeight, velocity, delta) {
  const nextVelocity = velocity - GRAVITY_M_S2 * delta;
  return {
    feetHeight: feetHeight + nextVelocity * delta,
    velocity: nextVelocity,
  };
}
export function canStandAt(
  walkable,
  x,
  y,
  radius = PLAYER_RADIUS_M,
  obstacles = [],
  feetHeight = 0,
) {
  const inside = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.71, radius * 0.71],
    [-radius * 0.71, radius * 0.71],
    [radius * 0.71, -radius * 0.71],
    [-radius * 0.71, -radius * 0.71],
  ].every(([dx, dy]) => containsWalkable(walkable, x + dx, y + dy));
  return inside && !collidesObstacle(obstacles, x, y, radius, feetHeight);
}
function shapeOf(poly) {
  const shape = new THREE.Shape(
    poly[0].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  shape.holes = poly
    .slice(1)
    .map(
      (ring) => new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  return shape;
}
function extrusion(poly, depth, color, base = 0) {
  const geometry = new THREE.ExtrudeGeometry(shapeOf(poly), {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, base, 0);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      transparent: false,
      opacity: 1,
      depthWrite: true,
    }),
  );
}
export function createModel(project, rows) {
  const group = new THREE.Group();
  group.name = project.projectName || project.storey.id;
  const visual = ARENA_VISUALS[project.gameMetadata?.style] ?? ARENA_VISUALS.rooms;
  group.userData.visual = visual;
  const ring = (p) => p.map((v) => [v.x, v.y]);
  for (const set of project.contourSets) {
    const outdoor = set.type === "outdoor";
    const original = [
      [ring(set.outer.points), ...set.holes.map((h) => ring(h.points))],
    ];
    let lower = original;
    if (set.type === "shell")
      for (const passage of project.doorPassages)
        lower = clipping.difference(lower, [ring(passage.points)]);
    const doorHead =
      set.type === "shell"
        ? openingVertical("door", project.storey.height).head
        : project.storey.height;
    lower.forEach((poly, index) => {
      const mesh = extrusion(
        poly,
        outdoor ? OUTDOOR_SLAB_M : doorHead,
          outdoor ? visual.outdoor : visual.wall,
        outdoor ? -OUTDOOR_SLAB_M : 0,
      );
      mesh.name = index ? `${set.id}-lower-${index + 1}` : set.id;
      mesh.userData.kind = "structure";
      group.add(mesh);
    });
    if (set.type === "shell" && project.storey.height > doorHead) {
      original.forEach((poly, index) => {
        const mesh = extrusion(
          poly,
          project.storey.height - doorHead,
          visual.wall,
          doorHead,
        );
        mesh.name = `${set.id}-lintel${index ? `-${index + 1}` : ""}`;
        mesh.userData.kind = "structure";
        group.add(mesh);
      });
    }
  }
  rows
    .filter((row) => row.usage !== "outdoor")
    .forEach((row, index) => {
      row.geometry.forEach((poly) => {
        const mesh = extrusion(
          poly,
          0.08,
          visual.floors[index % visual.floors.length],
          -0.08,
        );
        mesh.name = row.id;
        mesh.userData.kind = "floor";
        group.add(mesh);
      });
    });
  project.doorPassages.forEach((passage) => {
      const mesh = extrusion([ring(passage.points)], 0.08, visual.floors[0], -0.08);
    mesh.name = `${passage.id}-floor`;
    mesh.userData.kind = "floor";
    group.add(mesh);
  });
  for (const obj of project.planObjects) {
    const { height, base } = objectVertical(obj, project.storey.height);
    group.add(createFurniture(obj, height, base));
  }
  for (const opening of project.openings) {
    const [a, b] = opening.alignedLine ?? opening.line;
    const { sill, head } = openingVertical(
      opening.category,
      project.storey.height,
    );
    const door = opening.category === "door";
    const width = Math.hypot(b.x - a.x, b.y - a.y),
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (door) {
      const pivot = new THREE.Group();
      pivot.name = opening.id;
      pivot.position.set(a.x, sill, -a.y);
      pivot.rotation.y = angle;
      Object.assign(pivot.userData, {
        kind: "door",
        open: false,
        width,
        height: head - sill,
        thickness: 0.065,
        closedRotation: angle,
        targetRotation: angle,
      });
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(width, head - sill, 0.065),
        new THREE.MeshStandardMaterial({
          color: visual.door,
          roughness: 0.55,
          transparent: false,
          opacity: 1,
          depthTest: true,
          depthWrite: true,
        }),
      );
      panel.position.set(width / 2, (head - sill) / 2, 0);
      panel.name = `${opening.id}-panel`;
      Object.assign(panel.userData, { kind: "door-panel", leaf: true });
      pivot.add(panel);
      const handleMaterial = new THREE.MeshStandardMaterial({
        color: 0xc7a85b,
        metalness: 0.65,
        roughness: 0.28,
      });
      for (const z of [-0.055, 0.055]) {
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16),
          handleMaterial,
        );
        handle.rotation.x = Math.PI / 2;
        handle.position.set(width * 0.82, (head - sill) * 0.48, z);
        handle.name = `${opening.id}-handle`;
        handle.userData.kind = "door-panel";
        pivot.add(handle);
      }
      group.add(pivot);
    } else {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, head - sill, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0x498cb0,
          transparent: true,
          opacity: 0.42,
          depthTest: true,
          depthWrite: false,
        }),
      );
      mesh.position.set((a.x + b.x) / 2, (sill + head) / 2, -(a.y + b.y) / 2);
      mesh.rotation.y = angle;
      mesh.name = opening.id;
      mesh.userData.kind = "opening";
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }
  group.updateMatrixWorld(true);
  return group;
}
export function disposeModel(model) {
  model.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) o.material.dispose();
  });
}
const NPC_TEAMS = [0xc75a5a, 0x4f7fc4];
const NPC_SKINS = [0xf0c5a4, 0xd99a74, 0xa9684f, 0x754334];
export const NPC_WEAPONS = [
  { id: "knife", label: "Messer", damage: 9, reach: 0.8, cooldown: 0.58, idealRange: 0.72 },
  { id: "sword", label: "Schwert", damage: 14, reach: 1.12, cooldown: 0.78, idealRange: 1.02 },
  { id: "spear", label: "Speer", damage: 12, reach: 1.55, cooldown: 0.9, idealRange: 1.42 },
  { id: "pistol", label: "Pistole", damage: 13, reach: 15, cooldown: 0.62, idealRange: 7.5, minRange: 3.2, ranged: true },
  { id: "rifle", label: "Karabiner", damage: 10, reach: 19, cooldown: 0.28, idealRange: 10, minRange: 4.4, ranged: true },
];
function npcMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.68, ...options });
}
function npcMesh(geometry, material, position, parent) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  parent.add(mesh);
  return mesh;
}
function healthTextSprite(team) {
  if (typeof document === "undefined") {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, opacity: 0 }),
    );
    sprite.userData = { team };
    return sprite;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(1.46, 0.41, 1);
  sprite.position.set(0, 0.04, 0.02);
  sprite.renderOrder = 3;
  sprite.userData = { canvas, texture, team };
  return sprite;
}
function drawHealthText(sprite, health, maxHealth) {
  const { canvas, texture, team } = sprite.userData;
  if (!canvas || !texture) return;
  const context = canvas.getContext("2d");
  const ratio = Math.max(0, health / maxHealth),
    accent = team ? "#5da8ff" : "#ff6969";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.fillStyle = "#091512e8";
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(9, 14, 494, 116, 18);
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(26, 34, 7, 28);
  context.font = "700 25px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = "#edf9f3";
  context.fillText(team ? "BLAU · OPERATOR" : "ROT · OPERATOR", 46, 48);
  context.font = "800 23px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.fillText(`${Math.ceil(health)} / ${maxHealth}`, 475, 48);
  context.fillStyle = "#1e302b";
  context.beginPath();
  context.roundRect(27, 76, 458, 29, 8);
  context.fill();
  context.fillStyle =
    ratio > 0.5 ? "#58cf7a" : ratio > 0.25 ? "#edb94d" : "#ee5b58";
  context.beginPath();
  context.roundRect(27, 76, Math.max(0, 458 * ratio), 29, 8);
  context.fill();
  context.font = "700 16px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillStyle = "#dcece4";
  context.fillText(`${Math.round(ratio * 100)}% LEBEN`, 256, 91);
  context.restore();
  texture.needsUpdate = true;
}
export function createNpc(team = 0, random = Math.random) {
  const group = new THREE.Group();
  group.name = "NPC-Gegner";
  group.userData.kind = "npc";
  const body = npcMaterial(NPC_TEAMS[team]);
  const skin = npcMaterial(NPC_SKINS[Math.floor(random() * NPC_SKINS.length)]);
  const hair = npcMaterial(
    [0x2d201b, 0x543429, 0x1c1715, 0x7a5132][Math.floor(random() * 4)],
  );
  const dark = npcMaterial(0x263337),
    vest = npcMaterial(team ? 0x284c71 : 0x743b3d),
    gear = npcMaterial(0x42534c);
  const legs = [];
  for (const side of [-1, 1]) {
    legs.push(npcMesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.7, 10),
      dark,
      new THREE.Vector3(side * 0.13, 0.37, 0),
      group,
    ));
    npcMesh(
      new THREE.BoxGeometry(0.17, 0.1, 0.28),
      npcMaterial(0x12191b),
      new THREE.Vector3(side * 0.13, 0.07, 0.03),
      group,
    );
  }
  npcMesh(
    new THREE.BoxGeometry(0.5, 0.66, 0.28),
    body,
    new THREE.Vector3(0, 1.07, 0),
    group,
  );
  npcMesh(
    new THREE.BoxGeometry(0.38, 0.45, 0.09),
    vest,
    new THREE.Vector3(0, 1.1, -0.17),
    group,
  );
  npcMesh(
    new THREE.BoxGeometry(0.23, 0.11, 0.1),
    gear,
    new THREE.Vector3(0, 1.36, -0.19),
    group,
  );
  npcMesh(
    new THREE.BoxGeometry(0.12, 0.17, 0.09),
    gear,
    new THREE.Vector3(-0.15, 1.02, -0.22),
    group,
  );
  npcMesh(
    new THREE.BoxGeometry(0.12, 0.17, 0.09),
    gear,
    new THREE.Vector3(0.15, 1.02, -0.22),
    group,
  );
  npcMesh(
    new THREE.SphereGeometry(0.19, 16, 12),
    skin,
    new THREE.Vector3(0, 1.57, 0),
    group,
  );
  npcMesh(
    new THREE.SphereGeometry(0.195, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.44),
    hair,
    new THREE.Vector3(0, 1.66, 0),
    group,
  );
  npcMesh(
    new THREE.BoxGeometry(0.25, 0.055, 0.04),
    npcMaterial(0x11191b),
    new THREE.Vector3(0, 1.58, -0.18),
    group,
  );
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = npcMesh(
      new THREE.CylinderGeometry(0.075, 0.085, 0.55, 10),
      skin,
      new THREE.Vector3(side * 0.32, 1.08, 0),
      group,
    );
    arm.rotation.z = side * -0.15;
    arms.push(arm);
  }
  const weapon = NPC_WEAPONS[Math.floor(random() * NPC_WEAPONS.length)];
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.36, 1.04, -0.02);
  group.add(weaponPivot);
  const grip = npcMaterial(0x563b29),
    steel = npcMaterial(0xc8d0d3, { metalness: 0.7, roughness: 0.28 });
  if (weapon.ranged) {
    const length = weapon.id === "rifle" ? 0.62 : 0.37;
    const frame = npcMesh(
      new THREE.BoxGeometry(0.13, 0.12, length),
      npcMaterial(0x29363a, { metalness: 0.45, roughness: 0.34 }),
      new THREE.Vector3(0.05, 0.15, -length * 0.42),
      weaponPivot,
    );
    frame.rotation.x = Math.PI / 2;
    const barrel = npcMesh(
      new THREE.CylinderGeometry(0.026, 0.026, length * 0.9, 8),
      steel,
      new THREE.Vector3(0.05, 0.2, -length * 0.82),
      weaponPivot,
    );
    barrel.rotation.x = Math.PI / 2;
  } else if (weapon.id === "spear") {
    const shaft = npcMesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.25, 8),
      grip,
      new THREE.Vector3(0, 0.28, 0),
      weaponPivot,
    );
    shaft.rotation.z = -0.38;
    const tip = npcMesh(
      new THREE.ConeGeometry(0.075, 0.22, 8),
      steel,
      new THREE.Vector3(-0.23, 0.86, 0),
      weaponPivot,
    );
    tip.rotation.z = -0.38;
  } else {
    const length = weapon.id === "sword" ? 0.72 : 0.36;
    const blade = npcMesh(
      new THREE.BoxGeometry(0.065, length, 0.035),
      steel,
      new THREE.Vector3(0, length * 0.28, 0),
      weaponPivot,
    );
    blade.rotation.z = -0.23;
    const handle = npcMesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8),
      grip,
      new THREE.Vector3(0.05, -0.08, 0),
      weaponPivot,
    );
    handle.rotation.z = -0.23;
    if (weapon.id === "sword") {
      const guard = npcMesh(
        new THREE.BoxGeometry(0.28, 0.045, 0.05),
        steel,
        new THREE.Vector3(0.07, 0.03, 0),
        weaponPivot,
      );
      guard.rotation.z = -0.23;
    }
  }
  let shield = false;
  if (random() < 0.48) {
    shield = true;
    const shieldMesh = npcMesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.045, 16),
      npcMaterial(team ? 0x294c80 : 0x873f3f),
      new THREE.Vector3(-0.4, 1.1, 0.04),
      group,
    );
    shieldMesh.rotation.x = Math.PI / 2;
  }
  const healthBar = new THREE.Group();
  healthBar.position.set(0, 2.13, 0);
  group.add(healthBar);
  const fill = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0x54c878,
      transparent: true,
      opacity: 0,
    }),
  );
  healthBar.add(fill);
  const healthText = healthTextSprite(team);
  healthBar.add(healthText);
  drawHealthText(healthText, 100, 100);
  return {
    group,
    weapon,
    shield,
    weaponPivot,
    healthFill: fill,
    healthBar,
    healthText,
    rig: { arms, legs },
  };
}
function createLootCrate(kind = "weapon") {
  const variants = {
    weapon: { label: "Waffenkiste", wood: 0x825234, metal: 0xc89a49 },
    medical: { label: "Sanitätskiste", wood: 0xd8ddd5, metal: 0xbc3540 },
    supply: { label: "Vorratskiste", wood: 0x536f5a, metal: 0xd4b34e },
  };
  const variant = variants[kind] ?? variants.weapon,
    group = new THREE.Group();
  group.name = variant.label;
  group.userData = { kind: "loot", lootKind: kind };
  const wood = npcMaterial(variant.wood),
    metal = npcMaterial(variant.metal, { metalness: 0.45, roughness: 0.4 });
  const base = npcMesh(
    new THREE.BoxGeometry(0.62, 0.38, 0.46),
    wood,
    new THREE.Vector3(0, 0.19, 0),
    group,
  );
  const lid = npcMesh(
    new THREE.BoxGeometry(0.66, 0.12, 0.5),
    wood,
    new THREE.Vector3(0, 0.44, 0),
    group,
  );
  lid.rotation.x = -0.1;
  for (const x of [-0.25, 0.25])
    npcMesh(
      new THREE.BoxGeometry(0.055, 0.42, 0.5),
      metal,
      new THREE.Vector3(x, 0.24, 0),
      group,
    );
  const lock = npcMesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.045),
    metal,
    new THREE.Vector3(0, 0.34, -0.255),
    group,
  );
  lock.name = "Loot-Schloss";
  base.name = variant.label;
  if (kind === "medical") {
    const cross = npcMesh(
      new THREE.BoxGeometry(0.23, 0.055, 0.025),
      metal,
      new THREE.Vector3(0, 0.27, -0.267),
      group,
    );
    const stem = npcMesh(
      new THREE.BoxGeometry(0.055, 0.23, 0.025),
      metal,
      new THREE.Vector3(0, 0.27, -0.268),
      group,
    );
    cross.name = stem.name = "Medizin-Symbol";
  }
  if (kind === "supply")
    npcMesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.13, 10),
      metal,
      new THREE.Vector3(0, 0.53, 0),
      group,
    );
  return group;
}
function createHeldWeapon(weapon) {
  const group = new THREE.Group();
  group.name = `Ausgerüstet: ${weapon.label}`;
  const grip = npcMaterial(0x513423),
    steel = npcMaterial(0xdde5e8, { metalness: 0.85, roughness: 0.18 }),
    dark = npcMaterial(0x252e31, { metalness: 0.55, roughness: 0.27 }),
    polymer = npcMaterial(0x141b20, { metalness: 0.18, roughness: 0.46 }),
    glove = npcMaterial(0x252b2d, { roughness: 0.82 }),
    sleeve = npcMaterial(0x263d4a, { roughness: 0.9 });
  const add = (geometry, material, x, y, z, rotation = {}) => {
    const mesh = npcMesh(geometry, material, new THREE.Vector3(x, y, z), group);
    mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.renderOrder = 10;
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), grip, 0, 0, -0.06, {
    x: Math.PI / 2,
  });
  if (weapon.id === "bow") {
    const limb = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.38, -0.64),
        new THREE.Vector3(0.16, 0, -0.72),
        new THREE.Vector3(0, -0.38, -0.64),
      ]),
      24,
      0.021,
      8,
      false,
    );
    add(limb, grip, 0, 0, 0);
    const stringGeometry = new THREE.BufferGeometry(),
      string = new THREE.Line(
        stringGeometry,
        new THREE.LineBasicMaterial({
          color: 0xe8e2ce,
          depthTest: false,
          depthWrite: false,
        }),
      );
    string.renderOrder = 11;
    group.add(string);
    const arrow = new THREE.Group(),
      shaft = npcMesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.56, 7),
        npcMaterial(0x8a5731),
        new THREE.Vector3(0, 0, -0.28),
        arrow,
      ),
      tip = npcMesh(
        new THREE.ConeGeometry(0.037, 0.13, 7),
        steel,
        new THREE.Vector3(0, 0, -0.62),
        arrow,
      );
    shaft.rotation.x = tip.rotation.x = Math.PI / 2;
    arrow.visible = false;
    group.add(arrow);
    group.userData.bow = { string, arrow };
  } else if (["pistol", "smg", "rifle", "shotgun", "sniper"].includes(weapon.id)) {
    const long =
        weapon.id === "sniper" ? 1.3 : weapon.id === "rifle" ? 1.12 : weapon.id === "smg" ? 0.72 : weapon.id === "shotgun" ? 0.98 : 0.48,
      barrelZ = -(long * 0.5 + 0.16);
    if (weapon.id === "pistol") {
      add(new THREE.BoxGeometry(0.19, 0.12, 0.47), dark, 0, 0.04, -0.41);
      add(new THREE.BoxGeometry(0.14, 0.21, 0.22), polymer, 0, -0.12, -0.25, {
        x: -0.16,
      });
      add(new THREE.BoxGeometry(0.12, 0.035, 0.24), steel, 0, 0.12, -0.42);
      add(new THREE.BoxGeometry(0.035, 0.05, 0.06), steel, 0, 0.14, -0.62);
    } else {
      add(new THREE.BoxGeometry(0.2, 0.16, long * 0.53), dark, 0, 0.02, -0.44);
      add(
        new THREE.CylinderGeometry(0.045, 0.045, long * 0.7, 10),
        steel,
        0,
        0.04,
        barrelZ,
        { x: Math.PI / 2 },
      );
      add(new THREE.BoxGeometry(0.21, 0.1, 0.38), weapon.id === "shotgun" ? grip : polymer, 0, -0.02, 0.02);
      add(new THREE.BoxGeometry(0.12, 0.26, 0.2), polymer, 0, -0.16, -0.22, {
        x: -0.14,
      });
      add(new THREE.BoxGeometry(0.1, 0.05, 0.28), steel, 0, 0.15, -0.42);
      if (weapon.id === "shotgun")
        add(
          new THREE.CylinderGeometry(0.07, 0.07, 0.32, 10),
          dark,
          0,
          -0.01,
          -0.6,
          { x: Math.PI / 2 },
        );
      else add(new THREE.BoxGeometry(0.14, 0.19, 0.32), dark, 0, -0.13, -0.42);
    }
    const flash = add(
      new THREE.SphereGeometry(0.07, 10, 8),
      npcMaterial(0xffd66b, { emissive: 0xff8b18, emissiveIntensity: 2 }),
      0,
      0.04,
      weapon.id === "pistol" ? -0.67 : -1.02,
    );
    flash.visible = false;
    group.userData.muzzleFlash = flash;
  } else if (weapon.id === "spear") {
    add(new THREE.CylinderGeometry(0.022, 0.022, 1.28, 10), grip, 0, 0, -0.67, {
      x: Math.PI / 2,
    });
    add(new THREE.ConeGeometry(0.07, 0.26, 8), steel, 0, 0, -1.44, {
      x: -Math.PI / 2,
    });
  } else if (weapon.id === "axe") {
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.78, 10), grip, 0, 0, -0.44, {
      x: Math.PI / 2,
    });
    add(new THREE.BoxGeometry(0.36, 0.08, 0.12), steel, 0, 0, -0.78);
    add(new THREE.BoxGeometry(0.09, 0.12, 0.14), dark, 0, 0, -0.78);
  } else if (weapon.id === "hammer") {
    add(new THREE.CylinderGeometry(0.038, 0.038, 0.68, 10), grip, 0, 0, -0.39, {
      x: Math.PI / 2,
    });
    add(new THREE.BoxGeometry(0.18, 0.18, 0.32), dark, 0, 0, -0.74);
  } else {
    const length = weapon.id === "sword" ? 0.9 : 0.48;
    add(
      new THREE.BoxGeometry(0.065, 0.045, length),
      steel,
      0,
      0,
      -(length / 2 + 0.17),
    );
    if (weapon.id === "sword")
      add(new THREE.BoxGeometry(0.32, 0.052, 0.06), steel, 0, 0, -0.17);
  }
  // First-person hands make the weapon pose readable without covering the crosshair.
  add(new THREE.CylinderGeometry(0.075, 0.095, 0.43, 10), sleeve, 0.1, -0.31, 0.06, {
    x: 0.82,
    z: -0.16,
  });
  add(new THREE.SphereGeometry(0.09, 12, 9), glove, 0.015, -0.14, -0.12, {
    x: 0.25,
  });
  if (["smg", "rifle", "shotgun", "sniper", "bow"].includes(weapon.id)) {
    add(new THREE.CylinderGeometry(0.065, 0.085, 0.38, 10), sleeve, -0.14, -0.24, -0.34, {
      x: 1.03,
      z: 0.18,
    });
    add(new THREE.SphereGeometry(0.08, 12, 9), glove, -0.08, -0.08, -0.53);
  }
  group.position.set(0.34, -0.32, -0.62);
  group.rotation.set(-0.16, 0.08, 0.07);
  group.scale.setScalar(0.72);
  group.userData.baseRotation = -0.16;
  return group;
}
function createHeldArm() {
  const group = new THREE.Group();
  group.name = "Leere Hand";
  const skin = npcMaterial(0xc98b68, { roughness: 0.78 }),
    sleeve = npcMaterial(0x36556f, { roughness: 0.82 });
  const add = (geometry, material, x, y, z, rotation = {}) => {
    const mesh = npcMesh(geometry, material, new THREE.Vector3(x, y, z), group);
    mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.renderOrder = 10;
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    return mesh;
  };
  add(
    new THREE.CylinderGeometry(0.095, 0.11, 0.5, 12),
    sleeve,
    0.18,
    -0.15,
    -0.38,
    { x: 0.78, z: -0.32 },
  );
  add(
    new THREE.CylinderGeometry(0.07, 0.09, 0.35, 12),
    skin,
    0.28,
    -0.26,
    -0.64,
    { x: 0.8, z: -0.32 },
  );
  add(new THREE.SphereGeometry(0.115, 12, 10), skin, 0.36, -0.34, -0.78, {
    x: 0.15,
    z: -0.2,
  });
  group.position.set(0.23, -0.31, -0.5);
  group.rotation.set(-0.06, 0.05, 0.02);
  group.scale.setScalar(0.78);
  group.userData.baseRotation = -0.06;
  return group;
}
export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color(0x94a9b4);
    this.scene.fog = new THREE.Fog(0x94a9b4, 35, 150);
    this.scene.add(new THREE.HemisphereLight(0xb6d9f4, 0x6d6956, 2.2));
    const sun = new THREE.DirectionalLight(0xffefd6, 2.8);
    sun.position.set(10, 25, 15);
    this.scene.add(sun);
    this.npcGroup = new THREE.Group();
    this.npcGroup.name = "NPCs";
    this.scene.add(this.npcGroup);
    this.npcs = [];
    this.lootGroup = new THREE.Group();
    this.lootGroup.name = "Loot";
    this.scene.add(this.lootGroup);
    this.loot = [];
    this.impactGroup = new THREE.Group();
    this.impactGroup.name = "Treffer-Effekte";
    this.scene.add(this.impactGroup);
    this.impacts = [];
    this.playerHealth = 100;
    this.playerMaxHealth = 100;
    this.playerArmor = 0;
    this.playerKills = 0;
    this.playerDeaths = 0;
    this.playerAttackCooldown = 0;
    this.playerStamina = 100;
    this.dashRemaining = 0;
    this.dashCooldown = 0;
    this.invulnerableTime = 0;
    this.damageAge = 0;
    this.boostRemaining = 0;
    this.feedbackTimer = 0;
    this.stepTimer = 0;
    this.ads = false;
    this.controlSettings = { sensitivity: 1, fov: 80 };
    this.noises = [];
    this.smokeFields = [];
    this.simulationTime = 0;
    this.statusTimer = 0;
    this.match = null;
    this.bestScore = Number(localStorage.getItem('arena-forge-best-score')) || 0;
    this.paused = false;
    this.audioLevels = { sound: 0.7, music: 0.35 };
    this.audioContext = null;
    this.musicTimer = 0;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 2000);
    this.scene.add(this.camera);
    this.heldWeapon = new THREE.Group();
    this.heldWeapon.name = "Ausgerüstete Waffe";
    this.camera.add(this.heldWeapon);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.pointer = new PointerLockControls(
      this.camera,
      this.renderer.domElement,
    );
    this.keys = new Set();
    this.hotbar = Array(9).fill(null);
    this.inventory = Array(27).fill(null);
    this.selectedSlot = 0;
    this.creativeCounter = 0;
    this.inventoryOpen = false;
    this.primaryHeld = false;
    this.bowDraw = 0;
    this.bowDrawing = false;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.renderer.domElement.addEventListener("mousedown", (event) => {
      if (!this.game || this.paused || this.inventoryOpen || !this.pointer.isLocked || this.match?.phase !== 'active') return;
      if (event.button === 0) {
        event.preventDefault();
        this.primaryHeld = true;
        if (this.hotbar[this.selectedSlot]?.weapon?.id === "bow")
          this.beginBowDraw();
        else this.primaryAction();
      }
      if (event.button === 2) {
        event.preventDefault();
        const selected = this.hotbar[this.selectedSlot];
        if (this.toggleDoorTarget(true)) return;
        if (selected?.weapon?.ammoCapacity && selected.weapon.id !== 'bow') this.ads = true;
        else if (selected?.item) this.useItem(selected.item);
        else this.placeSelected();
      }
    });
    this.pointer.addEventListener("lock", () => this.gameEvent(true));
    this.pointer.addEventListener("unlock", () => this.gameEvent(false));
    addEventListener("keydown", (event) => {
      if (!this.game || this.inventoryOpen || !this.pointer.isLocked) return;
      if (/^Digit[1-9]$/.test(event.code)) {
        event.preventDefault();
        this.selectHotbar(Number(event.code.slice(5)) - 1, true);
        return;
      }
      if (event.code === 'KeyE') { event.preventDefault(); if (!event.repeat) this.interact(); return; }
      if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) this.reloadWeapon(); return; }
      if (event.code === 'KeyC' || event.code === 'ControlLeft') { event.preventDefault(); if (!event.repeat) this.dashPlayer(); return; }
      if (
        ![
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "Space",
          "ShiftLeft",
          "ShiftRight",
        ].includes(event.code)
      )
        return;
      event.preventDefault();
      if (event.code === "Space") {
        if (!event.repeat) this.jumpRequested = true;
        return;
      }
      this.keys.add(event.code);
    });
    addEventListener("mouseup", (event) => {
      if (event.button === 2) this.ads = false;
      if (event.button !== 0) return;
      this.primaryHeld = false;
      if (this.bowDrawing) this.releaseBowDraw();
    });
    addEventListener("keyup", (event) => this.keys.delete(event.code));
    addEventListener("blur", () => this.clearInput());
    addEventListener("visibilitychange", () => {
      if (document.hidden) this.clearInput();
    });
    this.renderer.domElement.addEventListener(
      "wheel",
      (event) => {
        if (!this.game || this.inventoryOpen || !event.deltaY) return;
        event.preventDefault();
        this.selectHotbar(event.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
    this.renderer.domElement.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.renderer.setAnimationLoop(() => {
      const delta = Math.min(this.clock.getDelta(), 0.05);
      if (this.game) {
        if (!this.paused && !this.inventoryOpen && this.pointer.isLocked && this.match?.phase === 'active') {
          this.updatePlayerSystems(delta);
          this.updateHeldWeaponAnimation(delta);
          this.updateImpacts(delta);
          this.updateDoors(delta);
            this.updateAutomaticFire();
            this.movePlayer(delta);
            this.updateNpcs(delta);
            this.updateMatch(delta);
            this.playAmbientMusic(delta);
        }
      } else this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  gameEvent(locked) {
    if (!locked) this.clearInput();
    if (locked && this.match?.phase === 'ready') { this.match.start(); this.emitMatch(); }
    this.container.dispatchEvent(
      new CustomEvent("game-lock", { detail: { locked } }),
    );
  }
  clearInput() {
    this.keys.clear();
    this.jumpRequested = false;
    this.primaryHeld = false;
    this.bowDraw = 0;
    this.bowDrawing = false;
    this.ads = false;
    this.secondaryMouseDown = false;
  }
  setPaused(paused) {
    this.paused = paused;
    this.clearInput();
    this.container.dispatchEvent(
      new CustomEvent("game-pause", { detail: { paused } }),
    );
  }
  setAudioLevels(levels = {}) {
    this.audioLevels = { ...this.audioLevels, ...levels };
  }
  dispatch(name, detail) {
    this.container.dispatchEvent(new CustomEvent(name, { detail }));
  }
  setControlSettings(settings = {}) {
    this.controlSettings = { ...this.controlSettings, ...settings };
    this.controlSettings.fov = THREE.MathUtils.clamp(Number(this.controlSettings.fov) || 80, 65, 105);
    this.pointer.pointerSpeed = THREE.MathUtils.clamp(Number(this.controlSettings.sensitivity) || 1, .2, 3);
    if (this.game) { this.camera.fov = this.controlSettings.fov; this.camera.updateProjectionMatrix(); }
  }
  emitMatch() {
    if (this.match) this.dispatch('match-status', { ...this.match.snapshot(), bestScore: this.bestScore });
  }
  updateMatch(delta) {
    const result = this.match.tick(delta, this.npcs.filter(npc => !npc.dead).length);
    if (result === 'wave') {
      this.clearNpcs();
      this.spawnNpcs(this.match.total);
      this.playerHealth = Math.min(100, this.playerHealth + 35);
      this.playerArmor = Math.min(100, this.playerArmor + 25);
      this.refillAmmo(1);
      this.spawnLoot(2);
      this.emitHotbar(`Welle ${this.match.wave} · Gesundheit und Munition ergänzt.`);
      this.invulnerableTime = 2;
    }
    if (result === 'victory' || result === 'defeat') this.finishMatch();
    this.statusTimer -= delta;
    if (this.statusTimer <= 0) {
      this.statusTimer = .12;
      this.emitMatch(); this.emitPlayerStatus(); this.updateInteraction(); this.emitMinimap();
    }
  }
  finishMatch() {
    this.clearInput();
    this.pointer.unlock();
    this.bestScore = Math.max(this.bestScore, this.match.score);
    try { localStorage.setItem('arena-forge-best-score', String(this.bestScore)); } catch {}
    this.emitMatch();
    this.playTone(this.match.phase === 'victory' ? 660 : 130, .6);
  }
  refillAmmo(magazines = 2) {
    for (const item of [...this.hotbar, ...this.inventory]) {
      if (!item?.weapon?.ammoCapacity) continue;
      item.reserveAmmo = Math.min(item.weapon.reserveCapacity, item.reserveAmmo + item.weapon.ammoCapacity * magazines);
    }
  }
  reloadWeapon() {
    const item = this.hotbar[this.selectedSlot];
    if (!beginReload(item)) return false;
    this.ads = false;
    this.bowDrawing = false;
    this.playTone(280, .1, this.audioLevels.sound * .55);
    this.emitHotbar();
    return true;
  }
  dashPlayer() {
    if (this.playerStamina < 28 || this.dashCooldown > 0 || this.dashRemaining > 0) return false;
    this.playerStamina -= 28;
    this.dashRemaining = .2;
    this.dashCooldown = 1.2;
    this.playTone(190, .14, this.audioLevels.sound * .4);
    return true;
  }
  updatePlayerSystems(delta) {
    this.simulationTime += delta;
    this.playerAttackCooldown = Math.max(0, this.playerAttackCooldown - delta);
    this.invulnerableTime = Math.max(0, this.invulnerableTime - delta);
    this.damageAge += delta;
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.dashRemaining = Math.max(0, this.dashRemaining - delta);
    this.boostRemaining = Math.max(0, this.boostRemaining - delta);
    this.noises = this.noises.map(noise => ({ ...noise, age: noise.age + delta })).filter(noise => noise.age < 2);
    this.smokeFields = this.smokeFields
      .map((field) => ({ ...field, time: field.time - delta }))
      .filter((field) => field.time > 0);
    if (this.damageAge > 7 && this.playerHealth < 65) this.playerHealth = Math.min(65, this.playerHealth + delta * 4);
    const item = this.hotbar[this.selectedSlot];
    if (tickReload(item, delta)) { this.playTone(520, .06); this.emitHotbar(); }
    if (item?.weapon?.id === 'bow' && item.ammo === 0 && item.reserveAmmo > 0 && !item.reloadRemaining) this.reloadWeapon();
    const targetFov = this.ads ? (item?.weapon?.id === 'sniper' ? 30 : 56) : this.controlSettings.fov + (this.dashRemaining > 0 ? 6 : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, delta * 12));
    this.camera.updateProjectionMatrix();
  }
  emitMinimap() {
    const points = this.walkable.flatMap(poly => poly[0]);
    this.dispatch('mini-map', {
      player: { x: this.camera.position.x, y: -this.camera.position.z, yaw: this.camera.rotation.y },
      bounds: { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])) },
      rooms: this.walkable.map(poly => poly[0]),
      enemies: this.npcs.filter(npc => !npc.dead && npc.seenByPlayer).map(npc => ({ x: npc.group.position.x, y: -npc.group.position.z, visible: true })),
      loot: this.loot.map(crate => ({ x: crate.position.x, y: -crate.position.z })),
    });
  }
  playTone(
    frequency,
    duration = 0.12,
    volume = this.audioLevels.sound,
    type = "triangle",
  ) {
    if (!volume || typeof AudioContext === "undefined") return;
    try {
      const context = (this.audioContext ??= new AudioContext()),
        oscillator = context.createOscillator(),
        gain = context.createGain(),
        now = context.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(Math.min(0.12, volume * 0.12), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {}
  }
  playAmbientMusic(delta) {
    this.musicTimer -= delta;
    if (this.musicTimer > 0 || !this.audioLevels.music) return;
    this.musicTimer = 1.8 + Math.random() * 1.3;
    this.playTone(
      [196, 220, 247, 294][Math.floor(Math.random() * 4)],
      1.15,
      this.audioLevels.music * 0.32,
      "sine",
    );
  }
  restartGame(project, rows, gameConfig = {}) {
    this.setModel(createModel(project, rows));
    this.setGame(true, project, rows, gameConfig);
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setModel(model) {
    this.pointer.unlock();
    this.initializedModel = null;
    this.match = null;
    this.clearNpcs();
    this.clearLoot();
    this.clearImpacts();
    if (this.model) {
      this.scene.remove(this.model);
      disposeModel(this.model);
    }
    this.hotbar.fill(null);
    this.inventory.fill(null);
    this.selectedSlot = 0;
    this.model = model;
    this.scene.add(model);
    this.fit();
    this.emitHotbar();
  }
  fit(top = false) {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d =
      (Math.max(size.x, size.y, size.z, 1) * 1.05) /
      Math.min(this.camera.aspect || 1, 1);
    this.camera.position
      .copy(center)
      .add(
        top
          ? new THREE.Vector3(0, d, 0.001)
          : new THREE.Vector3(d * 0.65, d * 0.8, d * 0.85),
      );
    this.camera.far = d * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }
  setGame(enabled, project, rows, gameConfig = {}) {
    this.game = enabled;
    this.controls.enabled = !enabled;
    this.clearInput();
    if (!enabled) {
      this.savedPlayerView = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
      this.paused = false;
      if (this.pointer.isLocked) this.pointer.unlock();
      this.heldWeapon.visible = false;
      this.camera.fov = 42;
      this.camera.near = 0.01;
      this.camera.updateProjectionMatrix();
      this.gameEvent(false);
      return;
    }
    if (this.initializedModel === this.model && this.savedPlayerView) {
      this.camera.position.copy(this.savedPlayerView.position);
      this.camera.quaternion.copy(this.savedPlayerView.quaternion);
      this.heldWeapon.visible = true;
      this.camera.fov = this.controlSettings.fov;
      this.camera.updateProjectionMatrix();
      this.emitMatch();
      return;
    }
    this.initializedModel = this.model;
    this.project = project;
    this.gameConfig = { ...gameConfig };
    const sky = this.model.userData.visual?.sky ?? 0x94a9b4;
    this.scene.background.setHex(sky);
    this.scene.fog.color.setHex(sky);
    this.match = new Match({ mode: gameConfig.gameMode, ...gameConfig });
    this.playerHealth = this.playerMaxHealth = 100;
    this.playerArmor = 35;
    this.playerStamina = 100;
    this.playerKills = this.playerDeaths = 0;
    this.playerAttackCooldown = 0;
    this.boostRemaining = this.dashRemaining = 0;
    this.invulnerableTime = 3;
    this.simulationTime = this.statusTimer = 0;
    this.noises = [];
    this.smokeFields = [];
    this.paused = false;
    this.walkable = rows.flatMap((row) => row.geometry);
    this.heldWeapon.visible = true;
    this.walkable.push(
      ...project.doorPassages.map((passage) => [
        passage.points.map((p) => [p.x, p.y]),
      ]),
    );
    this.eyeHeight = Math.min(
      EYE_HEIGHT_M,
      Math.max(project.storey.height - 0.15, 0.2),
    );
    this.obstacles = [];
    this.doors = [];
    this.model.traverse((mesh) => {
      if (mesh.userData.kind === "door") {
        this.doors.push(mesh);
        return;
      }
      if (
        mesh.userData.kind !== "object" ||
        mesh.userData.inInventory ||
        mesh.userData.base >= 0.05 ||
        mesh.userData.height <= 0.05
      )
        return;
      this.obstacles.push({
        ring: this.footprintAt(mesh),
        top: mesh.userData.base + mesh.userData.height,
        id: mesh.name,
        object: mesh,
      });
    });
    this.rebuildDoorObstacles();
    this.navigation = createNavigation({
      walkable: this.walkable,
      obstacles: () => [...this.obstacles, ...(this.doorObstacles || []), ...this.lootObstacles()],
      sightObstacles: () => this.smokeFields,
      portals: project.openings.filter(opening => opening.category === 'door').map(opening => ({ x: (opening.line[0].x + opening.line[1].x) / 2, y: (opening.line[0].y + opening.line[1].y) / 2 })),
      radius: .24,
      cellSize: .75,
    });
    this.camera.fov = this.controlSettings.fov;
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.resetPlayer();
    this.gameDifficulty = gameConfig.difficulty ?? "normal";
    this.hotbar[0] = makeWeaponItem(PLAYER_WEAPONS.find(weapon => weapon.id === 'pistol'));
    this.hotbar[1] = makeWeaponItem(PLAYER_WEAPONS.find(weapon => weapon.id === 'knife'));
    this.hotbar[2] = { item: { ...LOOT_ITEMS.find(item => item.id === 'medkit') } };
    this.hotbar[3] = { item: { ...LOOT_ITEMS.find(item => item.id === 'grenade') } };
    if (!this.npcs.length)
      this.spawnNpcs(
        Number(gameConfig.enemyCount) ||
          Math.min(
            8,
            Math.max(
              4,
              rows.filter((row) => row.usage !== "outdoor").length + 2,
            ),
          ),
      );
    if (!this.loot.length)
      this.spawnLoot(
        Math.min(
          12,
          Math.max(6, rows.filter((row) => row.usage !== "outdoor").length + 2),
        ),
      );
    this.emitPlayerStatus();
    this.emitHotbar();
    this.match.alive = this.npcs.length;
    this.match.total = this.npcs.length;
    this.emitMatch();
    this.emitMinimap();
  }
  clearNpcs() {
    this.npcGroup.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
    this.npcGroup.clear();
    this.npcs = [];
    this.emitNpcStatus();
  }
  clearLoot() {
    this.lootGroup.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
    this.lootGroup.clear();
    this.loot = [];
  }
  clearImpacts() {
    for (const impact of this.impacts) {
      impact.object.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) object.material.dispose();
      });
    }
    this.impactGroup.clear();
    this.impacts = [];
  }
  makeWeaponItem(weapon) {
    return makeWeaponItem(weapon);
  }
  emitNpcStatus() {
    const living = this.npcs.filter((npc) => !npc.dead);
    this.container.dispatchEvent(
      new CustomEvent("npc-status", {
        detail: {
          alive: living.length,
          red: living.filter((npc) => npc.team === 0).length,
          blue: living.filter((npc) => npc.team === 1).length,
        },
      }),
    );
  }
  emitPlayerStatus(message = "") {
    this.container.dispatchEvent(
      new CustomEvent("player-status", {
        detail: {
          health: Math.ceil(this.playerHealth),
          maxHealth: this.playerMaxHealth,
          armor: Math.ceil(this.playerArmor),
          stamina: Math.round(this.playerStamina),
          boosted: this.boostRemaining > 0,
          kills: this.playerKills,
          deaths: this.playerDeaths,
          message,
        },
      }),
    );
  }
  emitHotbar(message = "") {
    this.updateHeldWeapon();
    this.container.dataset.hotbarSelected = String(this.selectedSlot);
    this.container.dispatchEvent(
      new CustomEvent("hotbar-change", {
        detail: {
          selected: this.selectedSlot,
          slots: this.hotbar.map((item) => this.itemSummary(item)),
          inventory: this.inventory.map((item) => this.itemSummary(item)),
          message,
        },
      }),
    );
  }
  updateHeldWeapon() {
    const weapon = this.hotbar[this.selectedSlot]?.weapon;
    if (this.activeHeldWeapon && this.activeHeldWeapon.userData.weaponId === (weapon?.id ?? null)) return;
    if (this.activeHeldWeapon) {
      this.activeHeldWeapon.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) object.material.dispose();
      });
      this.activeHeldWeapon.removeFromParent();
    }
    this.activeHeldWeapon = weapon ? createHeldWeapon(weapon) : createHeldArm();
    this.activeHeldWeapon.userData.weaponId = weapon?.id ?? null;
    this.heldWeapon.add(this.activeHeldWeapon);
  }
  updateHeldWeaponAnimation(delta) {
    if (!this.activeHeldWeapon) return;
    if (this.bowDrawing)
      this.bowDraw = Math.min(1, this.bowDraw + delta * 1.35);
    this.updateBowVisual();
    const swing = Math.max(
      0,
      (this.activeHeldWeapon.userData.swing ?? 0) - delta * 5.7,
    );
    this.activeHeldWeapon.userData.swing = swing;
    const fire = Math.max(
      0,
      (this.activeHeldWeapon.userData.fire ?? 0) - delta * 7,
    );
    this.activeHeldWeapon.userData.fire = fire;
    const phase = Math.sin(Math.min(1, swing / 0.3) * Math.PI);
    const moving = this.keys.has("KeyW") || this.keys.has("KeyS") || this.keys.has("KeyA") || this.keys.has("KeyD");
    const bob = moving && this.grounded ? Math.sin(this.simulationTime * 10.5) : 0;
    this.adsBlend = THREE.MathUtils.lerp(this.adsBlend ?? 0, this.ads ? 1 : 0, Math.min(1, delta * 13));
    this.activeHeldWeapon.rotation.x =
      this.activeHeldWeapon.userData.baseRotation + swing * 2.1 - fire * 0.82;
    this.activeHeldWeapon.rotation.y = 0.05 * (1 - this.adsBlend) - phase * 0.3;
    this.activeHeldWeapon.rotation.z = 0.02 - swing * 1.05 + bob * 0.012;
    this.activeHeldWeapon.position.x = THREE.MathUtils.lerp(0.23, 0, this.adsBlend) + phase * 0.12 + bob * 0.012;
    this.activeHeldWeapon.position.y = THREE.MathUtils.lerp(-0.31, -0.25, this.adsBlend) - phase * 0.09 - fire * 0.13 + Math.abs(bob) * -0.012;
    if (this.activeHeldWeapon.userData.muzzleFlash)
      this.activeHeldWeapon.userData.muzzleFlash.visible = fire > 0.015;
  }
  updateBowVisual() {
    const bow = this.activeHeldWeapon?.userData.bow;
    if (!bow) return;
    const draw = this.bowDrawing ? this.bowDraw : 0,
      nockZ = -0.64 + draw * 0.23;
    bow.string.geometry.setFromPoints([
      new THREE.Vector3(0, 0.38, -0.64),
      new THREE.Vector3(0, 0, nockZ),
      new THREE.Vector3(0, -0.38, -0.64),
    ]);
    bow.arrow.visible = this.bowDrawing;
    bow.arrow.position.set(0, 0, draw * 0.23);
    this.activeHeldWeapon.rotation.y = 0.08 - draw * 0.12;
  }
  beginBowDraw() {
    const equipped = this.hotbar[this.selectedSlot];
    if (!equipped?.weapon || equipped.weapon.id !== "bow" || equipped.ammo <= 0)
      return;
    this.bowDraw = 0;
    this.bowDrawing = true;
    this.updateBowVisual();
  }
  releaseBowDraw() {
    const charge = this.bowDraw;
    this.bowDrawing = false;
    this.updateBowVisual();
    const equipped = this.hotbar[this.selectedSlot];
    if (
      !equipped?.weapon ||
      equipped.weapon.id !== "bow" ||
      equipped.ammo <= 0 ||
      charge < 0.12 ||
      this.playerAttackCooldown > 0
    )
      return;
    equipped.ammo--;
    this.playerAttackCooldown =
      equipped.weapon.cooldown * (1.15 - charge * 0.35);
    this.activeHeldWeapon.userData.swing = 0.12;
    this.fireRangedWeapon(equipped.weapon, charge);
    this.emitHotbar();
  }
  itemSummary(item) {
    if (!item) return null;
    if (item.weapon)
      return {
        id: `weapon-${item.weapon.id}`,
        label: item.weapon.label,
        icon: item.weapon.icon,
        weaponId: item.weapon.id,
        category: "weapon",
        ammo: item.ammo,
        ammoType: item.weapon.ammoType,
        ammoCapacity: item.weapon.ammoCapacity,
        reserveAmmo: item.reserveAmmo,
        reloading: item.reloadRemaining > 0,
        damage: item.weapon.damage,
        reloadTime: item.weapon.reloadTime,
      };
    if (item.item)
      return {
        id: item.item.id,
        label: item.item.label,
        icon: item.item.icon,
        category: item.item.category,
      };
    return {
      id: item.object.name,
      label: item.object.userData.itemLabel,
      category: item.object.userData.category,
    };
  }
  setInventoryOpen(open) {
    this.inventoryOpen = open;
    this.clearInput();
  }
  storage(name) {
    return name === "hotbar" ? this.hotbar : this.inventory;
  }
  moveInventoryItem(source, sourceIndex, target, targetIndex) {
    const from = this.storage(source),
      to = this.storage(target);
    if (!from || !to || !from[sourceIndex]) return false;
    [from[sourceIndex], to[targetIndex]] = [to[targetIndex], from[sourceIndex]];
    this.emitHotbar();
    return true;
  }
  quickMoveInventory(index) {
    const target = this.hotbar.findIndex((item) => !item);
    if (target < 0) {
      this.emitHotbar("Die Hotbar ist voll.");
      return false;
    }
    return this.moveInventoryItem("inventory", index, "hotbar", target);
  }
  quickMoveHotbar(index) {
    const target = this.inventory.findIndex((item) => !item);
    if (target < 0) {
      this.emitHotbar("Der Rucksack ist voll.");
      return false;
    }
    return this.moveInventoryItem("hotbar", index, "inventory", target);
  }
  addCreativeItem(templateId, target = "inventory", targetIndex = null) {
    if (templateId.startsWith("weapon:"))
      return this.addCreativeWeapon(templateId.slice(7), target, targetIndex);
    if (templateId.startsWith("item:")) {
      const definition = LOOT_ITEMS.find(
        (item) => item.id === templateId.slice(5),
      );
      const storage = this.storage(target);
      const index =
        targetIndex == null ? storage?.findIndex((item) => !item) : targetIndex;
      if (!definition || !storage || index < 0 || index >= storage.length || storage[index])
        return false;
      storage[index] = { item: { ...definition } };
      this.emitHotbar(`${definition.label} erhalten.`);
      return true;
    }
    const template = CREATIVE_CATALOG.find((item) => item.id === templateId),
      storage = this.storage(target);
    if (!template || !storage || !this.model) return false;
    const index =
      targetIndex == null ? storage.findIndex((item) => !item) : targetIndex;
    if (index < 0 || index >= storage.length || storage[index]) {
      this.emitHotbar("Der gewählte Inventarplatz ist belegt.");
      return false;
    }
    const object = createFurniture(
      {
        id: `creative-${template.id}-${++this.creativeCounter}`,
        category: template.category,
        size: template.size,
        placement: { x: 0, y: 0, rotation: 0 },
      },
      template.height,
      0,
    );
    object.userData.itemLabel = template.label;
    object.userData.inInventory = true;
    object.visible = false;
    this.model.add(object);
    storage[index] = { object };
    this.emitHotbar(`${template.label} zum Inventar hinzugefügt.`);
    return true;
  }
  addCreativeWeapon(weaponId, target = "inventory", targetIndex = null) {
    const weapon = PLAYER_WEAPONS.find((entry) => entry.id === weaponId),
      storage = this.storage(target);
    if (!weapon || !storage) return false;
    const index =
      targetIndex == null ? storage.findIndex((item) => !item) : targetIndex;
    if (index < 0 || index >= storage.length || storage[index]) {
      this.emitHotbar("Der gewählte Inventarplatz ist belegt.");
      return false;
    }
    storage[index] = this.makeWeaponItem(weapon);
    this.emitHotbar(`${weapon.label} zum Inventar hinzugefügt.`);
    return true;
  }
  selectHotbar(value, absolute = false) {
    this.bowDrawing = false;
    this.bowDraw = 0;
    this.ads = false;
    this.primaryHeld = false;
    this.selectedSlot = absolute
      ? Math.max(0, Math.min(8, value))
      : (this.selectedSlot + value + 9) % 9;
    this.emitHotbar();
  }
  centerHits() {
    if (!this.model) return [];
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return this.hitsAlong(direction);
  }
  hitsAlong(direction) {
    if (!this.model) return [];
    const meshes = [];
    for (const root of [this.model, this.lootGroup, this.npcGroup])
      root.traverse((object) => {
        if (!object.isMesh) return;
        let current = object,
          visible = true;
        while (current && current !== root) {
          if (!current.visible || current.userData.inInventory) {
            visible = false;
            break;
          }
          current = current.parent;
        }
        if (visible) meshes.push(object);
      });
    this.camera.updateMatrixWorld(true);
    this.model.updateMatrixWorld(true);
    this.lootGroup.updateMatrixWorld(true);
    this.npcGroup.updateMatrixWorld(true);
    this.raycaster.set(this.camera.position, direction.normalize());
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;
    return this.raycaster.intersectObjects(meshes, false);
  }
  doorRoot(object) {
    let current = object;
    while (current && current !== this.model) {
      if (current.userData.kind === "door") return current;
      current = current.parent;
    }
    return null;
  }
  doorAtCrosshair() {
    const hit = this.centerHits()[0];
    return hit && hit.distance < 2.7 ? this.doorRoot(hit.object) : null;
  }
  rebuildDoorObstacles() {
    this.doorObstacles = (this.doors || [])
      .map((door) => {
        const leaf = door.children.find((child) => child.userData.leaf);
        return (
          leaf && {
            ring: transformedFootprint(
              leaf,
              door.userData.width,
              door.userData.thickness,
            ),
            id: door.name,
            top: door.userData.height,
            object: door,
          }
        );
      })
      .filter(Boolean);
    this.container.dataset.openDoors = String(
      (this.doors || []).filter((door) => door.userData.open).length,
    );
  }
  toggleDoorTarget(silent = false) {
    const door = this.doorAtCrosshair();
    if (!door) {
      if (!silent) this.emitHotbar("Keine Tür im Fadenkreuz.");
      return false;
    }
    const opening = !door.userData.open;
    door.userData.open = opening;
    if (opening) {
      const local = door.worldToLocal(this.camera.position.clone());
      door.userData.openSign = local.z >= 0 ? 1 : -1;
    }
    door.userData.targetRotation =
      door.userData.closedRotation +
      (opening ? (door.userData.openSign * Math.PI) / 2 : 0);
    this.playTone(opening ? 440 : 300, 0.09);
    this.rebuildDoorObstacles();
    this.navigation?.invalidate();
    return true;
  }
  secondaryAction(fromMouseDown = false) {
    if (fromMouseDown) {
      this.secondaryMouseDown = true;
      setTimeout(() => {
        this.secondaryMouseDown = false;
      }, 150);
    }
    if (!this.toggleDoorTarget(true)) this.placeSelected();
  }
  updateDoors(delta) {
    let changed = false;
    for (const door of this.doors || []) {
      const difference = door.userData.targetRotation - door.rotation.y;
      if (Math.abs(difference) < 0.001) {
        door.rotation.y = door.userData.targetRotation;
        continue;
      }
      door.rotation.y += difference * Math.min(1, delta * 9);
      door.updateMatrixWorld(true);
      changed = true;
    }
    if (changed) {
      this.rebuildDoorObstacles();
      this.doorNavigationTimer = (this.doorNavigationTimer ?? 0) - delta;
      if (this.doorNavigationTimer <= 0) { this.navigation?.invalidate(); this.doorNavigationTimer = .3; }
    }
  }
  pickupTarget() {
    if (this.hotbar[this.selectedSlot]) return false;
    const hit = this.centerHits()[0];
    const object = hit && this.objectRoot(hit.object);
    if (!object || hit.distance > 2.8) return false;
    this.hotbar[this.selectedSlot] = { object };
    object.userData.inInventory = true;
    object.visible = false;
    this.obstacles = this.obstacles.filter(
      (obstacle) => obstacle.object !== object,
    );
    this.navigation?.invalidate();
    this.emitHotbar(
      `${object.userData.itemLabel} in Slot ${this.selectedSlot + 1} aufgenommen.`,
    );
    return true;
  }
  lootRoot(object) {
    let current = object;
    while (current && current !== this.lootGroup) {
      if (current.userData.kind === "loot") return current;
      current = current.parent;
    }
    return null;
  }
  npcRoot(object) {
    let current = object;
    while (current && current !== this.npcGroup) {
      if (current.userData.kind === "npc") return current;
      current = current.parent;
    }
    return null;
  }
  lootAtCrosshair() {
    const hit = this.centerHits()[0];
    const exact = hit && this.lootRoot(hit.object);
    if (exact && hit.distance < 2.7) return exact;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    let closest = null,
      best = Infinity;
    for (const crate of this.loot) {
      const offset = crate.position.clone().sub(this.camera.position);
      offset.y = 0;
      const distance = offset.length();
      if (!distance || distance > 2.35) continue;
      if (direction.dot(offset.normalize()) < 0.42) continue;
      const center = crate.position.clone().add(new THREE.Vector3(0, .32, 0));
      const ray = new THREE.Raycaster(this.camera.position, center.clone().sub(this.camera.position).normalize(), 0, this.camera.position.distanceTo(center) - .25);
      const blocked = ray.intersectObject(this.model, true).some(hit => {
        let object = hit.object;
        while (object && object !== this.model) { if (!object.visible || object.userData.inInventory) return false; object = object.parent; }
        return hit.object.userData.kind !== 'floor';
      });
      if (blocked) continue;
      if (distance < best) {
        best = distance;
        closest = crate;
      }
    }
    return closest;
  }
  npcAtCrosshair() {
    const hit = this.centerHits()[0];
    return hit ? this.npcRoot(hit.object) : null;
  }
  interact() {
    if (this.openLootTarget()) return true;
    if (this.toggleDoorTarget(true)) return true;
    return this.pickupTarget();
  }
  updateInteraction() {
    const crate = this.lootAtCrosshair();
    if (crate) { this.dispatch('interaction-status', { label: crate.name + ' durchsuchen', key: 'E', type: 'loot' }); return; }
    const door = this.doorAtCrosshair();
    if (door) { this.dispatch('interaction-status', { label: door.userData.open ? 'Tür schließen' : 'Tür öffnen', key: 'E', type: 'door' }); return; }
    const hit = this.centerHits()[0];
    const object = hit && this.objectRoot(hit.object);
    this.dispatch('interaction-status', object && hit.distance < 2.8 && !this.hotbar[this.selectedSlot] ? { label: object.userData.itemLabel + ' aufnehmen', key: 'E', type: 'object' } : { label: '' });
  }
  openLootTarget() {
    const crate = this.lootAtCrosshair();
    if (!crate) return false;
    const contents = crate.userData.contents ??= this.generateLootContents(crate.userData.lootKind);
    const found = [];
    while (contents.length) {
      const item = contents[0];
      const target = this.hotbar.findIndex(slot => !slot);
      const storage = target >= 0 ? this.hotbar : this.inventory;
      const slot = target >= 0 ? target : storage.findIndex(value => !value);
      if (item.item?.effect === 'ammo') {
        this.refillAmmo(2);
      } else {
        if (slot < 0) break;
        storage[slot] = item;
      }
      found.push(item.weapon?.label ?? item.item?.label);
      contents.shift();
    }
    if (!contents.length) {
      crate.removeFromParent();
      disposeModel(crate);
      this.loot = this.loot.filter(entry => entry !== crate);
      this.navigation?.invalidate();
    }
    if (found.length) {
      this.playTone(740, .12);
      this.emitHotbar(found.join(' · ') + ' erhalten.');
    } else this.emitHotbar('Kein freier Platz. Verschiebe Ausrüstung in den Rucksack.');
    return true;
  }
  generateLootContents(kind) {
    const ranged = PLAYER_WEAPONS.filter(weapon => weapon.ammoCapacity);
    const item = id => ({ item: { ...LOOT_ITEMS.find(entry => entry.id === id) } });
    if (kind === 'medical') return [item('medkit'), item('armor'), item('adrenaline')];
    if (kind === 'supply') return [item('ammo'), item('grenade'), item(Math.random() < .5 ? 'bandage' : 'smoke')];
    return [makeWeaponItem(ranged[Math.floor(Math.random() * ranged.length)]), item('ammo'), item('bandage')];
  }
  primaryAction() {
    const selected = this.hotbar[this.selectedSlot];
    if (selected?.weapon) return this.attackTarget(selected.weapon);
    return this.attackTarget({ id: 'fist', label: 'Faust', damage: 14, reach: 1.25, cooldown: .4 });
  }
  updateAutomaticFire() {
    const weapon = this.hotbar[this.selectedSlot]?.weapon;
    if (this.primaryHeld && weapon?.automatic) this.attackTarget(weapon);
  }
  useItem(item) {
    if (item.effect === 'heal') {
      if (this.playerHealth >= 100) return false;
      this.playerHealth = Math.min(100, this.playerHealth + item.amount);
      this.playTone(620, .18);
    } else if (item.effect === 'armor') {
      if (this.playerArmor >= 100) return false;
      this.playerArmor = Math.min(100, this.playerArmor + item.amount);
      this.playTone(340, .16);
    } else if (item.effect === 'boost') {
      this.boostRemaining = item.amount;
      this.playerStamina = 100;
      this.playTone(880, .16);
    } else if (item.effect === 'ammo') {
      this.refillAmmo(2);
      this.reloadWeapon();
    } else if (item.effect === 'grenade' || item.effect === 'smoke') {
      this.throwGrenade(item);
    } else return false;
    this.hotbar[this.selectedSlot] = null;
    this.emitHotbar(item.label + ' benutzt.');
    this.emitPlayerStatus();
    return true;
  }
  throwGrenade(item) {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const start = this.camera.position
      .clone()
      .addScaledVector(direction, 0.5)
      .add(new THREE.Vector3(0, -0.25, 0));
    const hit = this.hitsAlong(direction)[0];
    const end = hit?.point?.clone() ?? start.clone().addScaledVector(direction, 10);
    end.y = Math.max(0.16, end.y);
    const grenade = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      npcMaterial(item.effect === "smoke" ? 0x87959a : 0x3d5047, { metalness: 0.55, roughness: 0.3 }),
    );
    grenade.position.copy(start);
    this.impactGroup.add(grenade);
    this.impacts.push({ object: grenade, kind: "grenade", motion: { start, end, duration: 0.7, elapsed: 0 }, onArrival: () => this.explodeGrenade(end, item), linger: 0 });
    this.playTone(220, 0.08);
  }
  explodeGrenade(position, item) {
    const blast = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 12),
      new THREE.MeshBasicMaterial({ color: item.effect === "smoke" ? 0xb7c2c5 : 0xffb44d, transparent: true, opacity: 0.85 }),
    );
    blast.position.copy(position);
    this.impactGroup.add(blast);
    this.impacts.push({ object: blast, time: 0.55, blast: true });
    if (item.effect === "grenade") {
      for (const npc of this.npcs) {
        const distance = npc.group.position.distanceTo(position);
        const clear = this.navigation.segmentClear(
          { x: position.x, y: -position.z },
          { x: npc.group.position.x, y: -npc.group.position.z },
          { fromHeight: position.y + 0.1, toHeight: npc.feetHeight + 1 },
        );
        if (!npc.dead && distance < 4.2 && clear)
          this.damageNpc(npc, item.amount * (1 - distance / 4.4), { type: "player" });
      }
      const playerDistance = this.camera.position.distanceTo(position);
      if (playerDistance < 3.4)
        this.damagePlayer(item.amount * 0.42 * (1 - playerDistance / 3.6));
    } else {
      this.smokeFields.push({
        ring: [
          [position.x - 2.2, -position.z - 2.2],
          [position.x + 2.2, -position.z - 2.2],
          [position.x + 2.2, -position.z + 2.2],
          [position.x - 2.2, -position.z + 2.2],
        ],
        base: 0,
        top: 3,
        time: 8,
      });
      for (let index = 0; index < 6; index++) {
        const cloud = new THREE.Mesh(new THREE.SphereGeometry(0.45 + Math.random() * 0.25, 12, 10), new THREE.MeshBasicMaterial({ color: 0xaeb7b9, transparent: true, opacity: 0.45 }));
        cloud.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 1.8, 0.3 + Math.random(), (Math.random() - 0.5) * 1.8));
        this.impactGroup.add(cloud);
        this.impacts.push({ object: cloud, time: 2.8 });
      }
    }
    this.playTone(item.effect === "smoke" ? 160 : 75, 0.34);
  }
  attackTarget(weapon) {
    if (this.playerAttackCooldown > 0) return false;
    const equipped = this.hotbar[this.selectedSlot];
    const ranged = Boolean(weapon.ammoCapacity);
    if (ranged && (!equipped || equipped.reloadRemaining > 0)) return false;
    if (ranged && equipped.ammo <= 0) {
      this.reloadWeapon();
      return false;
    }
    this.playerAttackCooldown = weapon.cooldown;
    if (this.activeHeldWeapon) {
      this.activeHeldWeapon.userData.swing = ranged ? 0 : .3;
      this.activeHeldWeapon.userData.fire = ranged ? .18 : 0;
    }
    if (ranged) {
      equipped.ammo--;
      this.fireRangedWeapon(weapon);
      this.emitHotbar();
      return true;
    }
    const hits = this.centerHits();
    const hit = hits[0];
    const target = hit && this.npcs.find(npc => npc.group === this.npcRoot(hit.object));
    this.playTone(160, .065, this.audioLevels.sound * .4);
    if (!target || target.dead || hit.distance > weapon.reach) return true;
    this.damageNpc(target, weapon.damage, { type: 'player', weapon: weapon.label });
    return true;
  }
  fireRangedWeapon(weapon, charge = 1) {
    const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const moving = this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD');
    const spread = (weapon.spread ?? .01) * (this.ads ? .33 : 1) * (moving ? 1.5 : 1) * (weapon.id === 'bow' ? 1.3 - charge * .8 : 1);
    const pellets = weapon.pellets ?? 1;
    for (let index = 0; index < pellets; index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * spread;
      const direction = forward.clone().addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
      const hit = this.hitsAlong(direction).find(hit => hit.distance <= weapon.reach);
      const start = this.camera.position.clone().addScaledVector(direction, .3).addScaledVector(right, this.ads ? .03 : .14).addScaledVector(up, -.13);
      const end = hit?.point.clone() ?? this.camera.position.clone().addScaledVector(direction, weapon.reach);
      const target = hit && this.npcs.find(npc => npc.group === this.npcRoot(hit.object));
      const headshot = Boolean(target && hit.point.y > target.group.position.y + 1.44);
      const impactPosition = target?.group.position.clone();
      const onArrival = () => {
        if (target && !target.dead && target.group.position.distanceTo(impactPosition) < .85)
          this.damageNpc(target, shotDamage(weapon, hit.distance, { headshot, charge }), { type: 'player', headshot, weapon: weapon.label });
      };
      if (weapon.id === 'bow') this.launchArrow(start, end, direction, target, charge, onArrival);
      else this.launchBullet(start, end, weapon.id === 'shotgun' ? 0xf7bf76 : 0xffe3a0, hit, onArrival);
    }
    this.noises.push({ position: { x: this.camera.position.x, y: -this.camera.position.z }, radius: weapon.id === 'bow' ? 8 : 32, age: 0, sourceId: 'player' });
    if (this.noises.length > 12) this.noises.shift();
    this.camera.rotation.x = Math.min(1.35, this.camera.rotation.x + (weapon.recoil ?? 0) * (this.ads ? .7 : 1));
    this.camera.rotation.y += (Math.random() - .5) * (weapon.recoil ?? 0) * .65;
    this.playShot(weapon);
  }
  playShot(weapon, worldPosition = null) {
    const frequency =
      weapon.id === "shotgun" ? 72 : weapon.id === "sniper" ? 95 : weapon.id === "bow" ? 390 : weapon.id === "smg" ? 185 : 145;
    const volume = worldPosition
      ? this.audioLevels.sound * Math.max(0.08, 1 - worldPosition.distanceTo(this.camera.position) / 45)
      : this.audioLevels.sound;
    this.playTone(frequency, weapon.id === "shotgun" ? 0.18 : 0.09, volume, weapon.id === "bow" ? "triangle" : "sawtooth");
  }
  launchBullet(start, end, color, hit, onArrival = null) {
    const bullet = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 8, 8),
      npcMaterial(color, { emissive: color, emissiveIntensity: 2 }),
    );
    bullet.position.copy(start);
    this.impactGroup.add(bullet);
    this.impacts.push({
      object: bullet,
      motion: {
        start,
        end,
        duration: Math.max(0.1, Math.min(0.32, start.distanceTo(end) / 78)),
        elapsed: 0,
      },
      onArrival: () => {
        if (hit) this.addBulletHole(hit);
        onArrival?.();
      },
    });
  }
  launchArrow(start, end, direction, target, charge, onArrival = null) {
    const arrow = this.createWorldArrow();
    arrow.position.copy(start);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    this.impactGroup.add(arrow);
    this.impacts.push({
      object: arrow,
      kind: "arrow",
      motion: {
        start,
        end,
        duration: Math.max(
          0.12,
          Math.min(0.8, start.distanceTo(end) / (16 + charge * 18)),
        ),
        elapsed: 0,
      },
      onArrival: () => {
        if (target && !target.dead) target.group.attach(arrow);
        onArrival?.();
      },
      linger: 5,
    });
  }
  createWorldArrow() {
    const arrow = new THREE.Group(),
      wood = npcMaterial(0x744628),
      metal = npcMaterial(0xcdd6d8, { metalness: 0.7 });
    const shaft = npcMesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.62, 7),
        wood,
        new THREE.Vector3(0, 0, -0.31),
        arrow,
      ),
      tip = npcMesh(
        new THREE.ConeGeometry(0.04, 0.14, 7),
        metal,
        new THREE.Vector3(0, 0, -0.67),
        arrow,
      );
    shaft.rotation.x = tip.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const feather = npcMesh(
        new THREE.BoxGeometry(0.05, 0.015, 0.13),
        npcMaterial(0xd9d2c5),
        new THREE.Vector3(side * 0.025, 0, -0.04),
        arrow,
      );
      feather.rotation.z = side * 0.35;
    }
    return arrow;
  }
  addBulletHole(hit) {
    if (
      !hit.face ||
      this.npcRoot(hit.object) ||
      hit.object.userData.kind === "loot"
    )
      return;
    const normal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld),
      hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.045, 12),
        new THREE.MeshBasicMaterial({
          color: 0x15110d,
          transparent: true,
          opacity: 0.9,
          depthTest: true,
        }),
      );
    hole.position.copy(hit.point).addScaledVector(normal, 0.004);
    hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.impactGroup.add(hole);
    this.impacts.push({ object: hole, time: 5 });
  }
  updateImpacts(delta) {
    for (let index = this.impacts.length - 1; index >= 0; index--) {
      const impact = this.impacts[index];
      if (impact.motion) {
        const motion = impact.motion;
        motion.elapsed += delta;
        const progress = Math.min(1, motion.elapsed / motion.duration);
        impact.object.position.lerpVectors(motion.start, motion.end, progress);
        if (impact.kind === "grenade") {
          impact.object.position.y += Math.sin(progress * Math.PI) * 2.1;
          impact.object.rotation.x += delta * 15;
          impact.object.rotation.z += delta * 11;
        }
        if (impact.kind === "arrow") impact.object.position.y += Math.sin(progress * Math.PI) * 0.32;
        if (progress < 1) continue;
        impact.motion = null;
        impact.onArrival?.();
        impact.time = impact.linger ?? 0.08;
      }
      impact.time -= delta;
      if (impact.blast) impact.object.scale.setScalar(1 + (0.55 - Math.max(impact.time, 0)) * 5);
      if (impact.object.material?.opacity != null && impact.time < 0.45)
        impact.object.material.opacity = Math.max(0, impact.time / 0.45);
      if (impact.time <= 0) {
        impact.object.traverse((object) => {
          object.geometry?.dispose();
          if (object.material) object.material.dispose();
        });
        impact.object.removeFromParent();
        this.impacts.splice(index, 1);
      }
    }
  }
  objectRoot(object) {
    let current = object;
    while (current && current !== this.model) {
      if (current.userData.kind === "object") return current;
      current = current.parent;
    }
    return null;
  }
  footprintAt(object) {
    const { x: width, y: depth } = object.userData.size;
    object.updateMatrixWorld(true);
    return [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ].map(([x, z]) => {
      const point = object.localToWorld(new THREE.Vector3(x, 0, z));
      return [point.x, -point.z];
    });
  }
  placeSelected() {
    const item = this.hotbar[this.selectedSlot];
    if (!item?.object) return false;
    const hit = this.centerHits()[0];
    if (!hit) return false;
    const object = item.object,
      { height } = object.userData;
    const normal = hit.face?.normal
      .clone()
      .transformDirection(hit.object.matrixWorld);
    let targetObject = this.objectRoot(hit.object),
      placement = hit.point.clone(),
      base = hit.point.y;
    if (
      hit.object.userData.kind !== "floor" &&
      !targetObject &&
      hit.object.userData.kind !== "structure" &&
      hit.object.userData.kind !== "opening"
    )
      return false;
    if (!normal || normal.y < 0.55) {
      const direction = this.raycaster.ray.direction.clone();
      direction.y = 0;
      direction.normalize();
      placement.addScaledVector(
        direction,
        -(Math.max(object.userData.size.x, object.userData.size.y) / 2 + 0.1),
      );
      base = supportHeightAt(this.obstacles, placement.x, -placement.z, 0.03);
      placement.y = base;
      targetObject = null;
    }
    const previous = object.position.clone();
    object.position.copy(placement);
    object.updateMatrixWorld(true);
    const ring = this.footprintAt(object);
    const center = [placement.x, -placement.z];
    const inside = [center, ...ring].every(([x, y]) =>
      containsWalkable(this.walkable, x, y),
    );
    const support = this.obstacles.find(
      (obstacle) => obstacle.object === targetObject,
    );
    const blocked = [
      ...this.obstacles,
      ...(this.doorObstacles || []),
      ...this.lootObstacles(),
    ].some(
      (obstacle) =>
        obstacle !== support &&
        (obstacle.top == null || obstacle.top > base + 0.035) &&
        ringsOverlap(ring, obstacle.ring),
    );
    const playerBlocked = overlapsRing(
      ring,
      this.camera.position.x,
      -this.camera.position.z,
      PLAYER_RADIUS_M,
    );
    if (!inside || blocked || playerBlocked) {
      object.position.copy(previous);
      object.updateMatrixWorld(true);
      return false;
    }
    object.userData.base = base;
    object.userData.inInventory = false;
    object.visible = true;
    this.obstacles.push({ ring, top: base + height, id: object.name, object });
    this.navigation?.invalidate();
    this.hotbar[this.selectedSlot] = null;
    this.emitHotbar(`${object.userData.itemLabel} platziert.`);
    return true;
  }
  randomNpcPosition(near = null) {
    if (!this.walkable?.length) return null;
    const rings = this.walkable.map((poly) => poly[0]),
      points = rings.flat(),
      xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
    for (let attempt = 0; attempt < 120; attempt++) {
      const angle = Math.random() * Math.PI * 2,
        range = 1.6 + Math.random() * 2.4;
      const x = near
        ? near.x + Math.cos(angle) * range
        : bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const y = near
        ? near.y + Math.sin(angle) * range
        : bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      const clear = this.npcs.every(
        (npc) =>
          npc.dead ||
          Math.hypot(npc.group.position.x - x, -npc.group.position.z - y) >
            0.62,
      );
      const playerClear =
        !this.camera ||
        Math.hypot(this.camera.position.x - x, -this.camera.position.z - y) >
          1.65;
      if (
        clear &&
        playerClear &&
        canStandAt(
          this.walkable,
          x,
          y,
          0.22,
          [...this.obstacles, ...(this.doorObstacles || [])],
          0,
        )
      )
        return { x, y };
    }
    return null;
  }
  spawnNpcs(count) {
    const tuning = {
      easy: { health: 0.75, speed: 0.9, damage: 0.75 },
      normal: { health: 1, speed: 1, damage: 1 },
      hard: { health: 1.3, speed: 1.22, damage: 1.25 },
    }[this.gameDifficulty] ?? { health: 1, speed: 1, damage: 1 };
    for (let index = 0; index < count; index++) {
      const team = index % 2,
        previous = index % 2 ? this.npcs[this.npcs.length - 1] : null;
      const preferred = this.project?.gameMetadata?.enemies?.[index];
      const position =
        (preferred && canStandAt(
          this.walkable,
          preferred.x,
          preferred.y,
          0.22,
          [...this.obstacles, ...(this.doorObstacles || []), ...this.lootObstacles(), ...this.npcObstacles()],
          0,
        )
          ? preferred
          : this.randomNpcPosition(
          previous && {
            x: previous.group.position.x,
            y: -previous.group.position.z,
          },
        )) ?? this.randomNpcPosition();
      if (!position) continue;
      const created = createNpc(team);
      created.group.position.set(position.x, 0, -position.y);
      created.group.rotation.y = Math.random() * Math.PI * 2;
      this.npcGroup.add(created.group);
      const maxHealth = Math.round(100 * tuning.health);
      const id = `enemy-${this.match?.wave ?? 1}-${index + 1}`;
      const name = `${team ? "Blau" : "Rot"} ${String(index + 1).padStart(2, "0")}`;
      this.npcs.push({
        ...created,
        id,
        name,
        team,
        health: Math.round((65 + Math.random() * 35) * tuning.health),
        maxHealth,
        speed: (2.35 + Math.random() * 0.85) * tuning.speed,
        damageMultiplier: tuning.damage,
        cooldown: Math.random(),
        wander: null,
        hostileToPlayer: true,
        ai: createEnemyState({
          id,
          team,
          seed: Math.floor(Math.random() * 0xffffffff),
          reactionSeconds: this.gameDifficulty === "hard" ? 0.18 : this.gameDifficulty === "easy" ? 0.5 : 0.32,
          sightRange: this.gameDifficulty === "hard" ? 30 : this.gameDifficulty === "easy" ? 20 : 25,
        }),
        action: null,
        thinkTimer: (index % 8) * 0.016,
        jumpVelocity: 0,
        feetHeight: 0,
        grounded: true,
        pendingStrike: null,
        seenByPlayer: false,
        dead: false,
        deathTime: 0,
      });
    }
    this.npcs.forEach((npc) => this.updateNpcHealth(npc));
    this.emitNpcStatus();
  }
  spawnLoot(count) {
    for (let index = 0; index < count; index++) {
      const preferred = this.project?.gameMetadata?.loot?.[index];
      const position = preferred ?? this.randomLootPosition();
      if (!position) continue;
      const kind = preferred?.kind ?? ["weapon", "medical", "supply"][index % 3],
        crate = createLootCrate(kind);
      crate.position.set(position.x, 0, -position.y);
      crate.rotation.y = Math.random() * Math.PI * 2;
      this.lootGroup.add(crate);
      this.loot.push(crate);
    }
  }
  randomLootPosition() {
    if (!this.walkable?.length) return null;
    const points = this.walkable.flatMap((poly) => poly[0]),
      xs = points.map((point) => point[0]),
      ys = points.map((point) => point[1]);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
    let best = null,
      bestScore = -Infinity;
    for (let attempt = 0; attempt < 180; attempt++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      if (
        !canStandAt(
          this.walkable,
          x,
          y,
          0.38,
          [
            ...this.obstacles,
            ...(this.doorObstacles || []),
            ...this.lootObstacles(),
            ...this.npcObstacles(),
          ],
          0,
        )
      )
        continue;
      const playerDistance = Math.hypot(
        x - this.camera.position.x,
        y + this.camera.position.z,
      );
      if (playerDistance < 3.2) continue;
      const lootDistance = this.loot.length
        ? Math.min(
            ...this.loot.map((crate) =>
              Math.hypot(x - crate.position.x, y + crate.position.z),
            ),
          )
        : 5;
      if (lootDistance < 4) continue;
      const coverDistance = this.obstacles.length
        ? Math.min(
            ...this.obstacles.flatMap((obstacle) =>
              obstacle.ring.map(([ox, oy]) => Math.hypot(x - ox, y - oy)),
            ),
          )
        : 2;
      const score =
        Math.min(playerDistance, 9) +
        Math.min(lootDistance, 7) -
        Math.abs(coverDistance - 1.5) * 1.8;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }
  updateNpcHealth(npc) {
    const ratio = Math.max(0, npc.health / npc.maxHealth),
      width = 0.82 * ratio;
    npc.healthFill.scale.set(width, 0.055, 1);
    npc.healthFill.position.x = -0.41 + width / 2;
    npc.healthFill.position.z = 0.01;
    npc.healthFill.material.color.setHex(
      ratio > 0.5 ? 0x54c878 : ratio > 0.25 ? 0xf0b74d : 0xdf5a55,
    );
    drawHealthText(npc.healthText, npc.health, npc.maxHealth);
  }
  closestNpc(npc) {
    let target = null,
      best = Infinity;
    for (const candidate of this.npcs) {
      if (candidate.dead || candidate.team === npc.team) continue;
      const distance = npc.group.position.distanceToSquared(
        candidate.group.position,
      );
      if (distance < best) {
        best = distance;
        target = candidate;
      }
    }
    return target;
  }
  npcObstacles(exclude = null) {
    return this.npcs
      .filter((npc) => !npc.dead && npc !== exclude)
      .map((npc) => {
        const x = npc.group.position.x,
          y = -npc.group.position.z,
          r = 0.22;
        return {
          ring: [
            [x - r, y - r],
            [x + r, y - r],
            [x + r, y + r],
            [x - r, y + r],
          ],
          top: npc.feetHeight + 1.8,
          base: npc.feetHeight,
          object: npc.group,
        };
      });
  }
  lootObstacles() {
    return this.loot.map((crate) => {
      const x = crate.position.x,
        y = -crate.position.z,
        r = 0.32;
      return {
        ring: [
          [x - r, y - r],
          [x + r, y - r],
          [x + r, y + r],
          [x - r, y + r],
        ],
        top: 0.5,
        object: crate,
      };
    });
  }
  moveNpc(npc, x, y, delta) {
    const currentX = npc.group.position.x,
      currentY = -npc.group.position.z,
      dx = x - currentX,
      dy = y - currentY,
      length = Math.hypot(dx, dy);
    if (length < 0.03) return true;
    const scale = Math.min((npc.speed * delta) / length, 1),
      nextX = currentX + dx * scale,
      nextY = currentY + dy * scale;
    const obstacles = [
      ...this.obstacles,
      ...(this.doorObstacles || []),
      ...this.lootObstacles(),
      ...this.npcObstacles(npc),
    ];
    let moved = false;
    if (
      canStandAt(
        this.walkable,
        nextX,
        currentY,
        0.22,
        obstacles,
        npc.feetHeight,
      )
    ) {
      npc.group.position.x = nextX;
      moved = true;
    }
    if (
      canStandAt(
        this.walkable,
        npc.group.position.x,
        nextY,
        0.22,
        obstacles,
        npc.feetHeight,
      )
    ) {
      npc.group.position.z = -nextY;
      moved = true;
    }
    return length < 0.16;
  }
  npcCanSee(npc, position) {
    return this.navigation.segmentClear(
      { x: npc.group.position.x, y: -npc.group.position.z },
      { x: position.x, y: -position.z },
      { fromHeight: npc.feetHeight + 1.35, toHeight: position.y }
    );
  }
  rotateNpcTowards(npc, dx, dy, delta) {
    const desired = -Math.atan2(dx, dy);
    let difference = desired - npc.group.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    npc.group.rotation.y += Math.max(-delta * 8.5, Math.min(delta * 8.5, difference));
  }
  updateNpcJump(npc, delta, shouldJump = false, jumpVelocity = 4.8) {
    if (shouldJump && npc.grounded) { npc.jumpVelocity = jumpVelocity; npc.grounded = false; }
    const vertical = integrateVertical(npc.feetHeight, npc.jumpVelocity, delta);
    const ground = supportHeightAt([...this.obstacles, ...this.lootObstacles()], npc.group.position.x, -npc.group.position.z, .22);
    npc.feetHeight = vertical.feetHeight;
    npc.jumpVelocity = vertical.velocity;
    if (npc.jumpVelocity <= 0 && npc.feetHeight <= ground) {
      npc.feetHeight = ground;
      npc.jumpVelocity = 0;
      npc.grounded = true;
    } else npc.grounded = false;
    npc.group.position.y = Math.max(0, npc.feetHeight);
  }
  npcFireAt(npc, target) {
    const start = npc.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const targetPosition = target.player ? this.camera.position.clone().add(new THREE.Vector3(0, -.15, 0)) : target.group.position.clone().add(new THREE.Vector3(0, 1.15, 0));
    const distance = start.distanceTo(targetPosition);
    const spread = this.gameDifficulty === 'hard' ? .027 : this.gameDifficulty === 'easy' ? .075 : .046;
    const direction = targetPosition.clone().sub(start).normalize().add(new THREE.Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread)).normalize();
    const wallRay = new THREE.Raycaster(start, direction, 0, npc.weapon.reach);
    const wall = wallRay.intersectObject(this.model, true).find(hit => {
      let mesh = hit.object;
      while (mesh && mesh !== this.model) { if (!mesh.visible || mesh.userData.inInventory) return false; mesh = mesh.parent; }
      return true;
    });
    const end = wall && wall.distance < distance ? wall.point.clone() : start.clone().addScaledVector(direction, distance);
    const hitsTarget = !wall || wall.distance >= distance - .3;
    this.launchBullet(start, end, npc.team ? 0x76b6ff : 0xff8b72, wall, () => {
      if (!hitsTarget || npc.dead) return;
      const current = target.player ? this.camera.position.clone().add(new THREE.Vector3(0, -.15, 0)) : target.group.position.clone().add(new THREE.Vector3(0, 1.15, 0));
      if (current.distanceTo(end) > .48 || (!target.player && target.dead)) return;
      if (target.player) this.damagePlayer(npc.weapon.damage * npc.damageMultiplier, npc);
      else this.damageNpc(target, npc.weapon.damage * npc.damageMultiplier, { type: 'npc', npc, weapon: npc.weapon.label });
    });
    npc.weaponPivot.rotation.z = -.2;
    this.playShot(npc.weapon, start);
  }
  damageNpc(target, amount, attacker = null) {
    if (target.dead || amount <= 0) return;
    if (attacker?.type === 'player') {
      target.hostileToPlayer = true;
      target.ai.targetId = 'player';
      target.ai.reactionLeft = .14;
      target.ai.memory = { id: 'player', position: { x: this.camera.position.x, y: -this.camera.position.z }, expires: target.ai.time + 6, seenAt: target.ai.time, player: true };
    }
    const guard = target.shield && !attacker?.headshot && Math.random() < .2;
    const damage = amount * (guard ? .6 : 1);
    target.health = Math.max(0, target.health - damage);
    target.flashTime = .12;
    this.updateNpcHealth(target);
    if (attacker?.type === 'player') this.dispatch('combat-feedback', { type: target.health <= 0 ? 'kill' : 'hit', amount: Math.round(damage), headshot: attacker.headshot });
    if (target.health > 0) return;
    target.dead = true;
    target.deathTime = 2;
    target.healthBar.visible = false;
    if (attacker?.type === 'player') { this.playerKills++; this.match.kill(attacker.headshot); }
    this.dispatch('kill-feed', { killer: attacker?.type === 'player' ? 'Du' : attacker?.npc?.name ?? 'Arena', victim: target.name, weapon: attacker?.weapon ?? 'Kampf', player: attacker?.type === 'player' });
    if (this.loot.length < 26) {
      const drop = createLootCrate('supply');
      drop.scale.setScalar(.7);
      drop.position.copy(target.group.position); drop.position.y = 0;
      drop.name = 'Feldrucksack';
      drop.userData.contents = [{ item: { ...LOOT_ITEMS.find(item => item.id === 'ammo') } }, { item: { ...LOOT_ITEMS.find(item => item.id === (Math.random() < .3 ? 'armor' : 'bandage')) } }];
      this.lootGroup.add(drop); this.loot.push(drop);
      this.navigation?.invalidate();
    }
    this.emitNpcStatus(); this.emitPlayerStatus(); this.emitMatch();
  }
  damagePlayer(amount, attacker = null) {
    if (this.invulnerableTime > 0 || this.match?.phase !== 'active' || amount <= 0) return;
    const absorbed = Math.min(this.playerArmor, amount * .65);
    this.playerArmor -= absorbed;
    this.playerHealth = Math.max(0, this.playerHealth - amount + absorbed);
    this.damageAge = 0;
    this.dispatch('combat-feedback', { type: 'damage', amount: Math.round(amount - absorbed) });
    this.emitPlayerStatus();
    if (this.playerHealth > 0) return;
    this.playerDeaths++;
    this.dispatch('kill-feed', { killer: attacker?.name ?? 'Explosion', victim: 'Du', weapon: attacker?.weapon.label ?? 'Granate', player: false });
    if (!this.match.die()) { this.finishMatch(); return; }
    this.playerHealth = 100;
    this.playerArmor = 25;
    this.playerStamina = 100;
    this.invulnerableTime = 3;
    this.clearInput();
    this.resetPlayer();
    this.refillAmmo(1);
    this.emitPlayerStatus('Neu erschienen · 3 Sekunden Schutz.');
    this.emitHotbar(); this.emitMatch();
  }
  updateNpcs(delta) {
    this.navigation.beginFrame(2, 8);
    const entities = [
      { id: 'player', player: true, alive: this.playerHealth > 0, position: { x: this.camera.position.x, y: -this.camera.position.z }, feetHeight: this.feetHeight, team: -1 },
      ...this.npcs.map(npc => ({ id: npc.id, team: npc.team, alive: !npc.dead, position: { x: npc.group.position.x, y: -npc.group.position.z }, feetHeight: npc.feetHeight })),
    ];
    for (const npc of this.npcs) {
      if (npc.dead) {
        npc.deathTime -= delta;
        npc.group.rotation.z = THREE.MathUtils.lerp(npc.group.rotation.z, 1.45, delta * 5);
        if (npc.deathTime <= 0) npc.group.visible = false;
        continue;
      }
      npc.healthBar.quaternion.copy(npc.group.quaternion.clone().invert().multiply(this.camera.quaternion));
      npc.thinkTimer -= delta;
      if (npc.thinkTimer <= 0) {
        const dt = .12 + Math.max(0, -npc.thinkTimer);
        const result = decideEnemy(npc.ai, {
          position: { x: npc.group.position.x, y: -npc.group.position.z, feetHeight: npc.feetHeight },
          health: npc.health, maxHealth: npc.maxHealth, weapon: npc.weapon,
          entities, navigation: this.navigation, mode: this.match.mode === 'survival' ? 'survival' : 'skirmish',
          noises: this.noises, heading: -npc.group.rotation.y,
        }, dt);
        npc.ai = result.state;
        npc.action = result.action;
        npc.thinkTimer = .12;
        npc.seenByPlayer = this.navigation.segmentClear(entities[0].position, { x: npc.group.position.x, y: -npc.group.position.z }, { fromHeight: this.camera.position.y, toHeight: npc.feetHeight + 1.4 });
        if (result.action.attack) {
          const target = result.action.targetId === 'player' ? { player: true } : this.npcs.find(other => other.id === result.action.targetId && !other.dead);
          if (target && npc.weapon.ranged) this.npcFireAt(npc, target);
          else if (target) { npc.pendingStrike = { target, remaining: .19 }; npc.weaponPivot.rotation.z = -.9; }
        }
        if (result.action.jump) this.updateNpcJump(npc, 0, true, result.action.jumpVelocity);
        // Doors can be used by opponents; a closed leaf never becomes walk-through.
        for (const door of this.doors) {
          if (door.userData.open) continue;
          const center = door.localToWorld(new THREE.Vector3(door.userData.width / 2, 0, 0));
          if (Math.hypot(center.x - npc.group.position.x, center.z - npc.group.position.z) > 1.8) continue;
          const local = door.worldToLocal(npc.group.position.clone());
          door.userData.open = true;
          door.userData.openSign = local.z >= 0 ? 1 : -1;
          door.userData.targetRotation = door.userData.closedRotation + door.userData.openSign * Math.PI / 2;
          this.navigation.invalidate();
        }
      }
      const action = npc.action;
      if (action?.lookAt) this.rotateNpcTowards(npc, action.lookAt.x - npc.group.position.x, action.lookAt.y + npc.group.position.z, delta);
      const previous = npc.group.position.clone();
      if (action?.destination) this.moveNpc(npc, action.destination.x, action.destination.y, delta * action.speedMultiplier);
      this.updateNpcJump(npc, delta);
      const moving = Math.hypot(previous.x - npc.group.position.x, previous.z - npc.group.position.z) > .003;
      this.animateNpc(npc, delta, moving);
      if (npc.pendingStrike) {
        npc.pendingStrike.remaining -= delta;
        if (npc.pendingStrike.remaining <= 0) {
          const target = npc.pendingStrike.target;
          const position = target.player ? this.camera.position : target.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const distance = Math.hypot(position.x - npc.group.position.x, position.z - npc.group.position.z);
          if ((target.player || !target.dead) && distance <= npc.weapon.reach + .1 && Math.abs(position.y - (npc.feetHeight + 1.3)) < 1.05 && this.npcCanSee(npc, position)) {
            if (target.player) this.damagePlayer(npc.weapon.damage * npc.damageMultiplier, npc);
            else this.damageNpc(target, npc.weapon.damage * npc.damageMultiplier, { type: 'npc', npc, weapon: npc.weapon.label });
          }
          npc.pendingStrike = null;
        }
      }
    }
  }
  animateNpc(npc, delta, moving) {
    npc.animationTime = (npc.animationTime ?? 0) + delta * (moving ? npc.speed * 3.7 : 1.7);
    const stride = Math.sin(npc.animationTime) * (moving ? .52 : .025);
    npc.rig.legs.forEach((leg, index) => { leg.rotation.x = npc.grounded ? stride * (index ? -1 : 1) : -.45; });
    npc.rig.arms.forEach((arm, index) => { arm.rotation.x = npc.weapon.ranged ? -.5 : -stride * (index ? -1 : 1); });
    npc.weaponPivot.rotation.z *= Math.max(0, 1 - delta * 6);
    npc.flashTime = Math.max(0, (npc.flashTime ?? 0) - delta);
    npc.group.traverse(mesh => { if (mesh.material?.emissive) mesh.material.emissive.setHex(npc.flashTime > 0 ? 0x46170c : 0); });
  }
  lockGame() {
    if (this.game && !this.pointer.isLocked) this.pointer.lock();
  }
  resetPlayer() {
    if (!this.walkable?.length) return;
    const rings = this.walkable.map((poly) => poly[0]);
    const xs = rings.flat().map((p) => p[0]);
    const ys = rings.flat().map((p) => p[1]);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
    let spawn = null;
    let best = Infinity;
    const authoredSpawn = this.project?.gameMetadata?.spawn;
    if (authoredSpawn && this.canStand(authoredSpawn.x, authoredSpawn.y)) {
      spawn = { x: authoredSpawn.x, y: authoredSpawn.y };
      best = 0;
    }
    for (let iy = 0; !spawn && iy < 48; iy++)
      for (let ix = 0; ix < 48; ix++) {
        const point = {
          x: bounds.minX + ((ix + 0.5) / 48) * (bounds.maxX - bounds.minX),
          y: bounds.minY + ((iy + 0.5) / 48) * (bounds.maxY - bounds.minY),
        };
        if (!this.canStand(point.x, point.y)) continue;
        const score = (point.x - center.x) ** 2 + (point.y - center.y) ** 2;
        if (score < best) {
          best = score;
          spawn = point;
        }
      }
    spawn ??= { x: rings[0][0][0], y: rings[0][0][1] };
    this.feetHeight = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.jumpRequested = false;
    this.camera.position.set(spawn.x, this.eyeHeight, -spawn.y);
    this.camera.rotation.set(0, 0, 0, "YXZ");
    const targets = [];
    this.model?.traverse((object) => {
      if (
        object.userData.kind === "object" &&
        object.visible &&
        !object.userData.inInventory
      )
        targets.push(object);
    });
    targets.sort(
      (a, b) =>
        a.position.distanceToSquared(this.camera.position) -
        b.position.distanceToSquared(this.camera.position),
    );
    if (authoredSpawn?.lookX != null && authoredSpawn?.lookY != null)
      this.camera.lookAt(authoredSpawn.lookX, this.eyeHeight, -authoredSpawn.lookY);
    else if (targets[0])
      this.camera.lookAt(
        targets[0].position
          .clone()
          .add(new THREE.Vector3(0, targets[0].userData.height * 0.5, 0)),
      );
    else this.camera.lookAt(spawn.x, this.eyeHeight, -spawn.y - 1);
    this.updatePlayerData();
    this.gameEvent(this.pointer.isLocked);
  }
  containsPoint(x, y) {
    return containsWalkable(this.walkable, x, y);
  }
  canStand(x, y) {
    const feet = this.feetHeight ?? 0;
    return canStandAt(
      this.walkable,
      x,
      y,
      PLAYER_RADIUS_M,
      [
        ...this.obstacles,
        ...(this.doorObstacles || []),
        ...this.lootObstacles(),
        ...this.npcObstacles(),
      ],
      feet,
    );
  }
  movePlayer(delta) {
    if (this.jumpRequested && this.grounded) {
      this.verticalVelocity = JUMP_SPEED_M_S;
      this.grounded = false;
    }
    this.jumpRequested = false;
    const vertical = integrateVertical(
      this.feetHeight,
      this.verticalVelocity,
      delta,
    );
    this.feetHeight = vertical.feetHeight;
    this.verticalVelocity = vertical.velocity;
    const forward =
      Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    const side = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    if (forward || side) {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      const right = new THREE.Vector3(-direction.z, 0, direction.x);
      const sprinting =
        (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
        this.playerStamina > 0;
      if (sprinting) this.playerStamina = Math.max(0, this.playerStamina - delta * 23);
      const speed =
        WALK_SPEED_M_S *
        (sprinting ? SPRINT_MULTIPLIER : 1) *
        (this.dashRemaining > 0 ? 2.25 : 1) *
        (this.boostRemaining > 0 ? 1.12 : 1);
      const movement = direction
        .multiplyScalar(forward)
        .add(right.multiplyScalar(side))
        .normalize()
        .multiplyScalar(speed * delta);
      const currentX = this.camera.position.x,
        currentY = -this.camera.position.z;
      const targetX = currentX + movement.x,
        targetY = currentY - movement.z;
      if (this.canStand(targetX, currentY)) this.camera.position.x = targetX;
      if (this.canStand(this.camera.position.x, targetY))
        this.camera.position.z = -targetY;
      this.stepTimer -= delta * speed;
      if (this.stepTimer <= 0) {
        this.stepTimer = sprinting ? 1.8 : 2.25;
        this.playTone(sprinting ? 82 : 68, 0.025, this.audioLevels.sound * 0.08, "triangle");
      }
    } else this.playerStamina = Math.min(100, this.playerStamina + delta * 20);
    if (!(this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")))
      this.playerStamina = Math.min(100, this.playerStamina + delta * 11);
    const ground = supportHeightAt(
      [...this.obstacles, ...this.lootObstacles()],
      this.camera.position.x,
      -this.camera.position.z,
      PLAYER_RADIUS_M,
    );
    if (this.verticalVelocity <= 0 && this.feetHeight <= ground) {
      this.feetHeight = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else this.grounded = false;
    this.camera.position.y = this.feetHeight + this.eyeHeight;
    this.updatePlayerData();
  }
  updatePlayerData() {
    this.container.dataset.playerX = this.camera.position.x.toFixed(4);
    this.container.dataset.playerY = (-this.camera.position.z).toFixed(4);
    this.container.dataset.playerHeight = this.feetHeight.toFixed(4);
    this.container.dataset.playerGrounded = String(this.grounded);
    this.container.dataset.playerSprinting = String(
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
    );
  }
}

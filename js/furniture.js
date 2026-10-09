import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { objectToken, tokenLabel } from "./game-constants.js";

export const CREATIVE_CATALOG = [
  {
    id: "chair",
    label: "Stuhl",
    category: "furniture",
    size: { x: 0.55, y: 0.55 },
    height: 0.9,
  },
  {
    id: "table",
    label: "Tisch",
    category: "furniture",
    size: { x: 1.4, y: 0.8 },
    height: 0.75,
  },
  {
    id: "desk",
    label: "Schreibtisch",
    category: "furniture",
    size: { x: 1.5, y: 0.75 },
    height: 0.75,
  },
  {
    id: "sofa",
    label: "Sofa",
    category: "furniture",
    size: { x: 2, y: 0.9 },
    height: 0.85,
  },
  {
    id: "armchair",
    label: "Sessel",
    category: "furniture",
    size: { x: 0.9, y: 0.85 },
    height: 0.85,
  },
  {
    id: "bed",
    label: "Bett",
    category: "furniture",
    size: { x: 1.8, y: 2.1 },
    height: 0.58,
  },
  {
    id: "closet",
    label: "Schrank",
    category: "furniture",
    size: { x: 1.4, y: 0.58 },
    height: 2.1,
  },
  {
    id: "cabinet",
    label: "Kommode",
    category: "furniture",
    size: { x: 1.2, y: 0.5 },
    height: 1.05,
  },
  {
    id: "bathtub",
    label: "Badewanne",
    category: "sanitary",
    size: { x: 1.75, y: 0.78 },
    height: 0.58,
  },
  {
    id: "sink",
    label: "Waschbecken",
    category: "sanitary",
    size: { x: 0.65, y: 0.5 },
    height: 0.86,
  },
  {
    id: "toilet",
    label: "WC",
    category: "sanitary",
    size: { x: 0.48, y: 0.72 },
    height: 0.76,
  },
  {
    id: "shower",
    label: "Dusche",
    category: "sanitary",
    size: { x: 0.9, y: 0.9 },
    height: 2.05,
  },
  {
    id: "fridge",
    label: "Kühlschrank",
    category: "equipment",
    size: { x: 0.7, y: 0.68 },
    height: 1.9,
  },
  {
    id: "stove",
    label: "Herd",
    category: "equipment",
    size: { x: 0.65, y: 0.65 },
    height: 0.9,
  },
  {
    id: "machine",
    label: "Maschine",
    category: "equipment",
    size: { x: 1.15, y: 0.8 },
    height: 1.15,
  },
  {
    id: "lamp",
    label: "Stehleuchte",
    category: "lighting",
    size: { x: 0.48, y: 0.48 },
    height: 1.65,
  },
  { id: "crate", label: "Transportkiste", category: "equipment", size: { x: 1.2, y: 1.1 }, height: 0.95 },
  { id: "barrel", label: "Fass", category: "equipment", size: { x: 0.75, y: 0.75 }, height: 0.95 },
  { id: "sandbag", label: "Sandsackdeckung", category: "equipment", size: { x: 2.5, y: 0.75 }, height: 0.85 },
  { id: "rack", label: "Lagerregal", category: "equipment", size: { x: 3.2, y: 1.1 }, height: 2.2 },
  { id: "container", label: "Frachtcontainer", category: "equipment", size: { x: 6.2, y: 2.5 }, height: 2.55 },
  { id: "console", label: "Kontrollpult", category: "equipment", size: { x: 1.4, y: 0.75 }, height: 1.2 },
  { id: "barricade", label: "Betonbarriere", category: "equipment", size: { x: 2.8, y: 0.65 }, height: 1.15 },
  { id: "bench", label: "Parkbank", category: "furniture", size: { x: 1.8, y: 0.6 }, height: 0.65 },
  { id: "planter", label: "Pflanzkübel", category: "furniture", size: { x: 1.4, y: 0.9 }, height: 0.65 },
];

const colors = {
  wood: 0x9b6a43,
  woodDark: 0x65452f,
  fabric: 0x557e75,
  fabricLight: 0x91aaa2,
  white: 0xe7e6df,
  metal: 0x77817e,
  dark: 0x303936,
  glass: 0x8dcbd1,
  accent: 0xc99845,
};
const material = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0,
    ...extra,
  });

export function createFurniture(object, height, base = 0) {
  const group = new THREE.Group();
  const token = CREATIVE_CATALOG.find((item) => object.id.split("-").includes(item.id))?.id ?? objectToken(object.id),
    w = object.size.x,
    d = object.size.y,
    h = height;
  const mats = {
    wood: material(colors.wood),
    woodDark: material(colors.woodDark),
    fabric: material(colors.fabric),
    fabricLight: material(colors.fabricLight),
    white: material(colors.white),
    metal: material(colors.metal, { metalness: 0.55, roughness: 0.32 }),
    dark: material(colors.dark),
    glass: material(colors.glass, {
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    accent: material(colors.accent),
    concrete: material(0x98a19d, { roughness: 0.92 }),
    olive: material(0x8b8d63, { roughness: 0.95 }),
    soil: material(0x423b2c, { roughness: 1 }),
    leaf: material(0x52734e, { roughness: 0.9 }),
    screen: material(0x173937, { emissive: 0x4db9a0, emissiveIntensity: 0.65, roughness: 0.22 }),
  };
  const add = (name, geometry, mat, x, y, z, rotation = {}) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = `${object.id}-${name}`;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.userData.kind = "object-part";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (name, sx, sy, sz, x, y, z, mat = mats.wood, r = 0.025) =>
    add(
      name,
      new RoundedBoxGeometry(
        Math.max(sx, 0.015),
        Math.max(sy, 0.015),
        Math.max(sz, 0.015),
        2,
        Math.min(r, sx / 5, sy / 5, sz / 5),
      ),
      mat,
      x,
      y,
      z,
    );
  const cyl = (
    name,
    radius,
    length,
    x,
    y,
    z,
    mat = mats.metal,
    rotation = {},
  ) =>
    add(
      name,
      new THREE.CylinderGeometry(radius, radius, length, 18),
      mat,
      x,
      y,
      z,
      rotation,
    );
  const fourLegs = (top = 0.12, mat = mats.woodDark) => {
    const leg = Math.min(w, d) * 0.09;
    for (const [x, z] of [
      [-0.42, -0.38],
      [0.42, -0.38],
      [-0.42, 0.38],
      [0.42, 0.38],
    ])
      box(
        `leg-${x}-${z}`,
        leg,
        h - top,
        leg,
        x * w,
        (h - top) / 2,
        z * d,
        mat,
        0.012,
      );
  };
  if (token === "crate") {
    box("frame", w * 0.95, h * 0.92, d * 0.95, 0, h * 0.48, 0, mats.woodDark, 0.025);
    for (let index = 0; index < 4; index++) {
      const bandY = h * (0.15 + index * 0.23);
      box(`plank-front-${index}`, w, h * 0.2, 0.06, 0, bandY, -d * 0.485, mats.wood, 0.008);
      box(`plank-back-${index}`, w, h * 0.2, 0.06, 0, bandY, d * 0.485, mats.wood, 0.008);
      box(`plank-left-${index}`, 0.06, h * 0.2, d * 0.95, -w * 0.485, bandY, 0, mats.wood, 0.008);
      box(`plank-right-${index}`, 0.06, h * 0.2, d * 0.95, w * 0.485, bandY, 0, mats.wood, 0.008);
    }
    box("lid", w, h * 0.08, d, 0, h * 0.95, 0, mats.wood, 0.012);
    for (const x of [-w * 0.32, w * 0.32]) {
      box(`strap-front-${x}`, w * 0.035, h, 0.07, x, h / 2, -d * 0.5, mats.metal, 0.004);
      box(`strap-back-${x}`, w * 0.035, h, 0.07, x, h / 2, d * 0.5, mats.metal, 0.004);
      box(`strap-top-${x}`, w * 0.035, 0.035, d, x, h, 0, mats.metal, 0.004);
    }
    box("shipping-label", w * 0.28, h * 0.2, 0.012, 0, h * 0.58, -d * 0.53, mats.white, 0.003);
    for (let index = 0; index < 3; index++) box(`label-mark-${index}`, w * (0.17 - index * 0.035), h * 0.018, 0.012, 0, h * (0.62 - index * 0.04), -d * 0.54, mats.dark, 0.002);
  } else if (token === "barrel") {
    const radius = Math.min(w, d) * 0.48;
    cyl("drum", radius, h, 0, h / 2, 0, mats.metal);
    for (const fraction of [0.06, 0.28, 0.72, 0.94]) cyl(`steel-ring-${fraction}`, radius * 1.035, h * 0.045, 0, h * fraction, 0, mats.dark);
    cyl("lid", radius * 0.94, 0.035, 0, h + 0.012, 0, mats.dark);
    cyl("bung", radius * 0.14, 0.025, radius * 0.42, h + 0.034, 0, mats.metal);
    box("warning-panel", radius * 0.8, h * 0.21, 0.028, 0, h / 2, -radius, mats.accent, 0.01);
  } else if (token === "sandbag") {
    const columns = Math.max(2, Math.min(6, Math.round(w / 0.7)));
    for (let row = 0; row < 3; row++) for (let column = 0; column < columns; column++) {
      const sack = add(`sack-${row}-${column}`, new THREE.SphereGeometry(1, 10, 6), mats.olive, -w / 2 + (column + 0.5) * w / columns, h * (row + 0.5) / 3, 0);
      sack.scale.set(w / columns * 0.51, h / 3 * 0.57, d * 0.5);
      sack.rotation.y = (column + row) % 2 ? 0.06 : -0.06;
    }
  } else if (token === "rack") {
    for (const x of [-w * 0.47, w * 0.47]) for (const z of [-d * 0.44, d * 0.44]) box(`upright-${x}-${z}`, 0.075, h, 0.075, x, h / 2, z, mats.dark, 0.007);
    for (let level = 0; level < 3; level++) {
      const shelfY = h * (0.09 + level * 0.32);
      box(`shelf-${level}`, w, h * 0.035, d, 0, shelfY, 0, mats.metal, 0.008);
      for (let column = 0; column < 3; column++) {
        const boxW = w * 0.235, boxH = h * 0.21;
        box(`cargo-${level}-${column}`, boxW, boxH, d * 0.78, w * (column - 1) * 0.3, shelfY + boxH / 2 + h * 0.02, 0, (column + level) % 2 ? mats.wood : mats.woodDark, 0.015);
        box(`cargo-band-${level}-${column}`, boxW * 0.06, boxH, d * 0.79, w * (column - 1) * 0.3, shelfY + boxH / 2 + h * 0.02, 0, mats.accent, 0.003);
      }
    }
  } else if (token === "container") {
    const colorIndex = [...object.id].reduce((value, char) => value + char.charCodeAt(0), 0) % 4;
    const paint = material([0x557b7d, 0xb3824d, 0x6a795c, 0x785957][colorIndex], { metalness: 0.45, roughness: 0.62 });
    box("cargo-body", w, h, d, 0, h / 2, 0, paint, 0.015);
    const ribs = Math.max(8, Math.min(22, Math.round(w * 2.4)));
    for (let index = 0; index < ribs; index++) for (const z of [-d * 0.5, d * 0.5]) box(`corrugation-${index}-${z}`, w / ribs * 0.3, h * 0.95, 0.05, -w / 2 + (index + 0.5) * w / ribs, h / 2, z, paint, 0.004);
    for (const z of [-d * 0.23, d * 0.23]) {
      box(`cargo-door-${z}`, 0.055, h * 0.91, d * 0.46, w * 0.505, h / 2, z, paint, 0.004);
      cyl(`locking-bar-${z}`, 0.035, h * 0.84, w * 0.52, h / 2, z, mats.metal);
    }
    for (const x of [-w * 0.485, w * 0.485]) for (const z of [-d * 0.475, d * 0.475]) box(`corner-casting-${x}-${z}`, 0.16, h, 0.16, x, h / 2, z, mats.metal, 0.006);
    box("manifest", w * 0.13, h * 0.24, 0.035, w * 0.25, h * 0.55, -d * 0.525, mats.white, 0.005);
    for (let index = 0; index < 3; index++) box(`manifest-line-${index}`, w * 0.08, h * 0.022, 0.02, w * 0.25, h * (0.61 - index * 0.055), -d * 0.546, mats.dark, 0.002);
  } else if (token === "console") {
    box("pedestal", w * 0.92, h * 0.62, d * 0.83, 0, h * 0.31, 0, mats.dark, 0.04);
    box("control-deck", w, h * 0.08, d, 0, h * 0.68, 0, mats.metal, 0.025);
    box("monitor-case", w * 0.62, h * 0.38, d * 0.17, -w * 0.08, h * 0.86, d * 0.29, mats.dark, 0.025);
    box("display", w * 0.55, h * 0.29, 0.025, -w * 0.08, h * 0.86, d * 0.19, mats.screen, 0.01);
    for (let index = 0; index < 4; index++) box(`display-trace-${index}`, w * (0.32 - index * 0.045), h * 0.011, 0.012, -w * 0.13, h * (0.95 - index * 0.045), d * 0.17, mats.white, 0.002);
    for (let index = 0; index < 4; index++) cyl(`switch-${index}`, Math.min(w, d) * 0.045, 0.035, w * (index - 1.5) * 0.16, h * 0.73, -d * 0.22, index % 2 ? mats.accent : mats.screen);
  } else if (token === "barricade") {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(d * 0.19, h * 0.65);
    shape.lineTo(d * 0.16, h);
    shape.lineTo(-d * 0.16, h);
    shape.lineTo(-d * 0.19, h * 0.65);
    shape.closePath();
    add("jersey-barrier", new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.015, bevelThickness: 0.015, steps: 1 }), mats.concrete, -w / 2, 0, 0, { y: Math.PI / 2 });
    for (let index = 0; index < 5; index++) box(`reflector-${index}`, w * 0.09, h * 0.12, 0.025, w * (index - 2) * 0.18, h * 0.85, -d * 0.19, index % 2 ? mats.dark : mats.accent, 0.005);
  } else if (token === "bench") {
    for (const x of [-w * 0.36, w * 0.36]) {
      box(`support-${x}`, w * 0.07, h * 0.63, d * 0.8, x, h * 0.31, 0, mats.dark, 0.015);
      box(`back-support-${x}`, 0.055, h * 0.65, 0.055, x, h * 0.68, d * 0.36, mats.dark, 0.008);
    }
    for (let index = 0; index < 4; index++) box(`seat-slat-${index}`, w, h * 0.1, d * 0.22, 0, h * 0.6, d * (index - 1.5) * 0.24, mats.wood, 0.01);
    for (let index = 0; index < 2; index++) box(`back-slat-${index}`, w, h * 0.17, d * 0.12, 0, h * (0.78 + index * 0.18), d * 0.39, mats.wood, 0.01);
  } else if (token === "planter") {
    box("planter-base", w, h * 0.62, d, 0, h * 0.31, 0, mats.concrete, 0.045);
    box("soil", w * 0.89, h * 0.045, d * 0.89, 0, h * 0.62, 0, mats.soil, 0.01);
    const bushes = Math.max(1, Math.min(5, Math.ceil(w / 0.7)));
    for (let index = 0; index < bushes; index++) {
      const shrub = add(`shrub-${index}`, new THREE.IcosahedronGeometry(1, 1), mats.leaf, w * ((index + 0.5) / bushes - 0.5), h * 0.76, 0);
      shrub.scale.set(w / bushes * 0.48, h * 0.22, d * 0.43);
      shrub.rotation.y = index * 0.8;
    }
  } else if (["desk", "table", "coffeetable"].includes(token)) {
    const top = Math.max(0.09, h * 0.12);
    box("top", w, top, d, 0, h - top / 2, 0, mats.wood, 0.04);
    fourLegs(top);
    if (token === "desk") {
      box(
        "drawer",
        w * 0.3,
        h * 0.2,
        d * 0.78,
        w * 0.28,
        h * 0.73,
        0,
        mats.woodDark,
        0.025,
      );
      box("monitor-foot", w * 0.17, 0.035, d * 0.22, -w * 0.1, h + 0.017, d * 0.24, mats.dark, 0.008);
      box("monitor-stem", 0.045, 0.16, 0.045, -w * 0.1, h + 0.095, d * 0.24, mats.dark, 0.006);
      box("monitor", w * 0.35, 0.29, 0.04, -w * 0.1, h + 0.31, d * 0.24, mats.dark, 0.015);
      box("screen", w * 0.31, 0.25, 0.018, -w * 0.1, h + 0.31, d * 0.2, mats.screen, 0.008);
      box("keyboard", w * 0.27, 0.018, d * 0.16, -w * 0.1, h + 0.018, -d * 0.17, mats.dark, 0.005);
    }
  } else if (token === "chair") {
    box(
      "seat",
      w * 0.9,
      h * 0.12,
      d * 0.86,
      0,
      h * 0.48,
      0,
      mats.fabric,
      0.035,
    );
    fourLegs(h * 0.46, mats.woodDark);
    box(
      "back",
      w * 0.88,
      h * 0.48,
      d * 0.12,
      0,
      h * 0.75,
      d * 0.38,
      mats.fabric,
      0.04,
    );
  } else if (["sofa", "couch", "armchair"].includes(token)) {
    box("base", w, h * 0.28, d * 0.78, 0, h * 0.2, 0, mats.woodDark, 0.06);
    box(
      "seat",
      w * 0.76,
      h * 0.22,
      d * 0.58,
      0,
      h * 0.42,
      -d * 0.06,
      mats.fabricLight,
      0.07,
    );
    box(
      "back",
      w * 0.78,
      h * 0.5,
      d * 0.2,
      0,
      h * 0.68,
      d * 0.32,
      mats.fabric,
      0.07,
    );
    box(
      "arm-left",
      w * 0.11,
      h * 0.58,
      d * 0.72,
      -w * 0.445,
      h * 0.43,
      0,
      mats.fabric,
      0.055,
    );
    box(
      "arm-right",
      w * 0.11,
      h * 0.58,
      d * 0.72,
      w * 0.445,
      h * 0.43,
      0,
      mats.fabric,
      0.055,
    );
  } else if (token === "bed") {
    box("frame", w, h * 0.22, d, 0, h * 0.14, 0, mats.woodDark, 0.04);
    box(
      "mattress",
      w * 0.94,
      h * 0.28,
      d * 0.88,
      0,
      h * 0.37,
      -d * 0.03,
      mats.white,
      0.07,
    );
    box(
      "headboard",
      w,
      h * 0.75,
      d * 0.09,
      0,
      h * 0.43,
      d * 0.455,
      mats.wood,
      0.035,
    );
    box(
      "pillow-left",
      w * 0.38,
      h * 0.12,
      d * 0.22,
      -w * 0.23,
      h * 0.57,
      d * 0.29,
      mats.fabricLight,
      0.055,
    );
    box(
      "pillow-right",
      w * 0.38,
      h * 0.12,
      d * 0.22,
      w * 0.23,
      h * 0.57,
      d * 0.29,
      mats.fabricLight,
      0.055,
    );
  } else if (["closet", "wardrobe", "cabinet"].includes(token)) {
    box("body", w, h, d, 0, h / 2, 0, mats.wood, 0.035);
    box(
      "door-left",
      w * 0.47,
      h * 0.92,
      0.035,
      -w * 0.245,
      h * 0.5,
      -d * 0.51,
      mats.woodDark,
      0.012,
    );
    box(
      "door-right",
      w * 0.47,
      h * 0.92,
      0.035,
      w * 0.245,
      h * 0.5,
      -d * 0.51,
      mats.woodDark,
      0.012,
    );
    cyl(
      "handle-left",
      Math.min(w, d) * 0.025,
      h * 0.13,
      -w * 0.06,
      h * 0.52,
      -d * 0.54,
      mats.metal,
    );
    cyl(
      "handle-right",
      Math.min(w, d) * 0.025,
      h * 0.13,
      w * 0.06,
      h * 0.52,
      -d * 0.54,
      mats.metal,
    );
  } else if (["sink", "washbasin"].includes(token)) {
    box(
      "cabinet",
      w * 0.88,
      h * 0.72,
      d * 0.82,
      0,
      h * 0.36,
      d * 0.04,
      mats.wood,
      0.035,
    );
    box("basin", w, h * 0.16, d, 0, h * 0.82, 0, mats.white, 0.06);
    cyl("faucet", w * 0.035, h * 0.22, 0, h * 0.98, d * 0.16, mats.metal);
    cyl("spout", w * 0.028, d * 0.22, 0, h * 1.06, d * 0.06, mats.metal, {
      x: Math.PI / 2,
    });
  } else if (token === "bathtub") {
    box("base", w, h * 0.18, d, 0, h * 0.09, 0, mats.white, 0.06);
    box(
      "side-left",
      w * 0.94,
      h * 0.72,
      d * 0.12,
      0,
      h * 0.46,
      -d * 0.44,
      mats.white,
      0.055,
    );
    box(
      "side-right",
      w * 0.94,
      h * 0.72,
      d * 0.12,
      0,
      h * 0.46,
      d * 0.44,
      mats.white,
      0.055,
    );
    box(
      "end-a",
      w * 0.1,
      h * 0.72,
      d * 0.78,
      -w * 0.45,
      h * 0.46,
      0,
      mats.white,
      0.05,
    );
    box(
      "end-b",
      w * 0.1,
      h * 0.72,
      d * 0.78,
      w * 0.45,
      h * 0.46,
      0,
      mats.white,
      0.05,
    );
  } else if (["toilet", "wc"].includes(token)) {
    cyl("pedestal", w * 0.27, h * 0.5, 0, h * 0.25, d * 0.08, mats.white);
    add(
      "seat",
      new THREE.TorusGeometry(w * 0.28, w * 0.07, 10, 24),
      mats.white,
      0,
      h * 0.55,
      -d * 0.08,
      { x: Math.PI / 2 },
    );
    box(
      "tank",
      w * 0.82,
      h * 0.52,
      d * 0.3,
      0,
      h * 0.72,
      d * 0.32,
      mats.white,
      0.06,
    );
    cyl("button", w * 0.045, 0.025, 0, h * 0.995, d * 0.32, mats.metal);
  } else if (token === "shower") {
    box("tray", w, h * 0.07, d, 0, h * 0.035, 0, mats.white, 0.04);
    box(
      "glass-a",
      w * 0.03,
      h * 0.9,
      d * 0.95,
      -w * 0.48,
      h * 0.52,
      0,
      mats.glass,
      0.005,
    );
    box(
      "glass-b",
      w * 0.9,
      h * 0.9,
      d * 0.03,
      0,
      h * 0.52,
      d * 0.48,
      mats.glass,
      0.005,
    );
    cyl("pipe", w * 0.025, h * 0.76, w * 0.33, h * 0.52, d * 0.36, mats.metal);
    add(
      "head",
      new THREE.SphereGeometry(w * 0.1, 16, 8),
      mats.metal,
      w * 0.33,
      h * 0.89,
      d * 0.28,
    );
  } else if (["fridge", "refrigerator"].includes(token)) {
    box("body", w, h, d, 0, h / 2, 0, mats.white, 0.04);
    box("freezer-door", w * 0.96, h * 0.24, 0.045, 0, h * 0.85, -d * 0.515, mats.metal, 0.018);
    box("fridge-door", w * 0.96, h * 0.69, 0.045, 0, h * 0.375, -d * 0.515, mats.metal, 0.018);
    box("freezer-handle", w * 0.052, h * 0.17, 0.065, -w * 0.34, h * 0.85, -d * 0.59, mats.dark, 0.012);
    box("door-handle", w * 0.052, h * 0.3, 0.065, -w * 0.34, h * 0.47, -d * 0.59, mats.dark, 0.012);
    box("status-display", w * 0.22, h * 0.055, 0.02, w * 0.19, h * 0.83, -d * 0.555, mats.screen, 0.005);
    for (let index = 0; index < 4; index++) box(`vent-${index}`, w * 0.77, h * 0.008, 0.02, 0, h * (0.05 + index * 0.016), -d * 0.553, mats.dark, 0.002);
  } else if (["stove", "oven"].includes(token)) {
    box("body", w, h * 0.94, d, 0, h * 0.47, 0, mats.metal, 0.025);
    box("cooktop", w, h * 0.045, d, 0, h * 0.97, 0, mats.dark, 0.012);
    for (const x of [-w * 0.24, w * 0.24]) for (const z of [-d * 0.24, d * 0.24]) {
      cyl(`burner-${x}-${z}`, Math.min(w,d) * 0.145, 0.025, x, h * 1.006, z, mats.metal);
      cyl(`burner-inner-${x}-${z}`, Math.min(w,d) * 0.11, 0.029, x, h * 1.013, z, mats.dark);
    }
    box("oven-door", w * 0.87, h * 0.59, 0.045, 0, h * 0.36, -d * 0.52, mats.dark, 0.018);
    box("oven-window", w * 0.69, h * 0.4, 0.024, 0, h * 0.36, -d * 0.56, mats.metal, 0.01);
    box("oven-handle", w * 0.69, h * 0.04, 0.045, 0, h * 0.635, -d * 0.605, mats.metal, 0.01);
    for (let index = 0; index < 4; index++) cyl(`control-${index}`, w * 0.052, 0.035, w * (index - 1.5) * 0.22, h * 0.81, -d * 0.545, mats.dark, { x: Math.PI / 2 });
  } else if (["lamp", "light", "ceilinglight"].includes(token)) {
    if (h < 0.2)
      cyl("ceiling-shade", Math.min(w, d) * 0.45, h, 0, h / 2, 0, mats.white);
    else {
      cyl("base", Math.min(w, d) * 0.34, h * 0.05, 0, h * 0.025, 0, mats.metal);
      cyl("stem", Math.min(w, d) * 0.055, h * 0.72, 0, h * 0.4, 0, mats.metal);
      add(
        "shade",
        new THREE.CylinderGeometry(w * 0.18, w * 0.42, h * 0.25, 24),
        mats.accent,
        0,
        h * 0.82,
        0,
      );
    }
  } else {
    box(
      "body",
      w,
      h * 0.86,
      d,
      0,
      h * 0.43,
      0,
      object.category === "sanitary" ? mats.white : mats.dark,
      0.045,
    );
    box(
      "front",
      w * 0.84,
      h * 0.56,
      0.035,
      0,
      h * 0.43,
      -d * 0.51,
      object.category === "equipment" ? mats.metal : mats.wood,
      0.018,
    );
    for (let i = -1; i <= 1; i++)
      cyl(
        `control-${i}`,
        Math.min(w, d) * 0.045,
        0.025,
        i * w * 0.2,
        h * 0.76,
        -d * 0.54,
        mats.accent,
        { x: Math.PI / 2 },
      );
    box("top", w * 0.9, h * 0.06, d * 0.88, 0, h * 0.93, 0, mats.metal, 0.025);
  }
  // Furniture is static. Batch its parts by material to keep large maps cheap
  // to render while retaining the parent object for picking and inventory.
  const batches = new Map();
  for (const mesh of [...group.children]) {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(geometry);
    group.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [mat, geometries] of batches) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (geometries.length > 1) geometries.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `${object.id}-parts-${group.children.length}`;
    mesh.userData.kind = "object-part";
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const renderedHeight = new THREE.Box3().setFromObject(group).max.y;
  group.name = object.id;
  group.position.set(object.placement.x, base, -object.placement.y);
  group.rotation.y = (object.placement.rotation * Math.PI) / 180;
  Object.assign(group.userData, {
    kind: "object",
    category: object.category,
    itemLabel: tokenLabel(token),
    height: Math.max(h, renderedHeight),
    base,
    inInventory: false,
    size: { x: w, y: d },
    token,
  });
  return group;
}

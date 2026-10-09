/**
 * Gameplay constants and arena object defaults.
 * Arena height comes from the generated storey data.
 * Opening sill/head: Door and window defaults are clamped under the arena height.
 * Object height is chosen from its generated object token.
 */

export const EYE_HEIGHT_M = 1.6;
export const DOOR_SILL_M = 0;
export const DOOR_HEAD_M = 2.1;
export const WINDOW_SILL_M = 0.9;
export const WINDOW_HEAD_M = 2.1;
export const OUTDOOR_SLAB_M = 0.14;
export const DOOR_PASSAGE_DEPTH_M = 1.4;
export const PLAYER_RADIUS_M = 0.28;
export const WALK_SPEED_M_S = 3.2;
export const SPRINT_MULTIPLIER = 1.75;
export const JUMP_SPEED_M_S = 4.8;
export const GRAVITY_M_S2 = 12;
export const DEFAULT_STOREY_HEIGHT_M = 2.7;

const OBJECT_HEIGHT_M = {
  bathtub: { height: 0.55, base: 0 },
  shower: { height: 2.05, base: 0 },
  sink: { height: 0.86, base: 0 },
  washbasin: { height: 0.86, base: 0 },
  toilet: { height: 0.76, base: 0 },
  wc: { height: 0.76, base: 0 },
  closet: { height: 2.1, base: 0 },
  wardrobe: { height: 2.1, base: 0 },
  cabinet: { height: 1.05, base: 0 },
  fridge: { height: 1.9, base: 0 },
  stove: { height: 0.9, base: 0 },
  lamp: { height: 1.65, base: 0 },
  fireplace: { height: 1.2, base: 0 },
  saunabench: { height: 0.45, base: 0 },
  bed: { height: 0.55, base: 0 },
  sofa: { height: 0.85, base: 0 },
  couch: { height: 0.85, base: 0 },
  armchair: { height: 0.85, base: 0 },
  desk: { height: 0.75, base: 0 },
  table: { height: 0.75, base: 0 },
  coffeetable: { height: 0.42, base: 0 },
  chair: { height: 0.9, base: 0 },
  electricalappliance: { height: 0.9, base: 0 },
  appliance: { height: 0.9, base: 0 },
  machine: { height: 1.1, base: 0 },
  crate: { height: .95, base: 0 },
  barrel: { height: .95, base: 0 },
  sandbag: { height: .85, base: 0 },
  rack: { height: 2.2, base: 0 },
  container: { height: 2.55, base: 0 },
  console: { height: 1.2, base: 0 },
  barricade: { height: 1.15, base: 0 },
  bench: { height: .65, base: 0 },
  planter: { height: .65, base: 0 },
};

export function objectToken(id) {
  const tokens = String(id).toLowerCase().replace(/^obj-/, "").split("-");
  return (
    tokens.find((token) => Object.hasOwn(TOKEN_DE, token)) ?? tokens[0] ?? ""
  );
}

export function objectVertical(planObject, storeyHeight) {
  const token = objectToken(planObject.id);
  if (
    token !== "lamp" &&
    (planObject.category === "lighting" || /light|lampe/i.test(token))
  ) {
    const height = 0.08;
    const base = Math.max(storeyHeight - 0.18, 0.3);
    return { height, base };
  }
  const known = OBJECT_HEIGHT_M[token];
  if (known) return { height: known.height, base: known.base };
  if (planObject.category === "sanitary") return { height: 0.5, base: 0 };
  if (planObject.category === "built_in") return { height: 1.1, base: 0 };
  if (planObject.category === "equipment") return { height: 1.1, base: 0 };
  return { height: 0.75, base: 0 };
}

export function openingVertical(category, storeyHeight) {
  const headCap = Math.max(storeyHeight - 0.15, 0.4);
  if (category === "door") {
    return { sill: DOOR_SILL_M, head: Math.min(DOOR_HEAD_M, headCap) };
  }
  const sill = Math.min(WINDOW_SILL_M, headCap - 0.3);
  return { sill: Math.max(sill, 0.2), head: Math.min(WINDOW_HEAD_M, headCap) };
}

export const TOKEN_DE = {
  bathtub: "Badewanne",
  shower: "Dusche",
  sink: "Waschbecken",
  washbasin: "Waschbecken",
  toilet: "WC",
  wc: "WC",
  closet: "Schrank",
  wardrobe: "Schrank",
  cabinet: "Schrank",
  fireplace: "Kamin",
  saunabench: "Saunabank",
  sauna: "Sauna",
  bed: "Bett",
  sofa: "Sofa",
  couch: "Sofa",
  armchair: "Sessel",
  desk: "Schreibtisch",
  table: "Tisch",
  coffeetable: "Couchtisch",
  chair: "Stuhl",
  stove: "Herd",
  oven: "Backofen",
  fridge: "Kühlschrank",
  refrigerator: "Kühlschrank",
  dishwasher: "Spülmaschine",
  electricalappliance: "Elektrogerät",
  appliance: "Gerät",
  machine: "Maschine",
  crate: "Transportkiste",
  barrel: "Fass",
  sandbag: "Sandsäcke",
  rack: "Lagerregal",
  container: "Frachtcontainer",
  console: "Kontrollpult",
  barricade: "Barrikade",
  bench: "Bank",
  planter: "Pflanzkübel",
  lamp: "Leuchte",
  light: "Leuchte",
  ceilinglight: "Deckenleuchte",
  unknown: "Objekt",
};

export function tokenLabel(token) {
  return TOKEN_DE[token] || (token ? token : "Objekt");
}

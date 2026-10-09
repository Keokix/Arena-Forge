/** Weapon tuning and magazine rules, shared by simulation and UI. */
export const PLAYER_WEAPONS = [
  { id: 'knife', label: 'Kampfmesser', icon: 'knife', damage: 24, reach: 1.3, cooldown: .38 },
  { id: 'sword', label: 'Langschwert', icon: 'sword', damage: 38, reach: 1.7, cooldown: .62 },
  { id: 'spear', label: 'Stoßspeer', icon: 'spear', damage: 32, reach: 2.1, cooldown: .7 },
  { id: 'axe', label: 'Streitaxt', icon: 'axe', damage: 48, reach: 1.5, cooldown: .82 },
  { id: 'hammer', label: 'Kriegshammer', icon: 'hammer', damage: 58, reach: 1.4, cooldown: 1.02 },
  { id: 'bow', label: 'Jagdbogen', icon: 'bow', damage: 62, reach: 42, cooldown: .76, ammoType: 'Pfeile', ammoCapacity: 1, reserveCapacity: 20, reloadTime: .32, spread: .005, projectileSpeed: 30 },
  { id: 'pistol', label: 'Pistole · P12', icon: 'pistol', damage: 30, reach: 40, cooldown: .24, ammoType: 'Patronen', ammoCapacity: 12, reserveCapacity: 60, reloadTime: 1.1, spread: .016, recoil: .014 },
  { id: 'smg', label: 'Maschinenpistole · Vektor', icon: 'smg', damage: 18, reach: 30, cooldown: .075, ammoType: 'Patronen', ammoCapacity: 28, reserveCapacity: 140, reloadTime: 1.45, spread: .03, recoil: .012, automatic: true },
  { id: 'rifle', label: 'Sturmgewehr · A4', icon: 'rifle', damage: 28, reach: 60, cooldown: .115, ammoType: 'Patronen', ammoCapacity: 30, reserveCapacity: 120, reloadTime: 1.7, spread: .019, recoil: .018, automatic: true },
  { id: 'shotgun', label: 'Schrotflinte · Breacher', icon: 'shotgun', damage: 13, reach: 22, cooldown: .82, ammoType: 'Schrotpatronen', ammoCapacity: 6, reserveCapacity: 30, reloadTime: 2.05, spread: .12, recoil: .048, pellets: 9 },
  { id: 'sniper', label: 'Präzisionsgewehr · S7', icon: 'sniper', damage: 90, reach: 100, cooldown: 1.05, ammoType: 'Patronen', ammoCapacity: 5, reserveCapacity: 25, reloadTime: 2.2, spread: .006, recoil: .055 },
];

export const LOOT_ITEMS = [
  { id: 'bandage', label: 'Verband', icon: '✚', category: 'consumable', effect: 'heal', amount: 25 },
  { id: 'medkit', label: 'Medikit', icon: '✚', category: 'consumable', effect: 'heal', amount: 60 },
  { id: 'armor', label: 'Panzerplatte', icon: '▣', category: 'equipment', effect: 'armor', amount: 45 },
  { id: 'adrenaline', label: 'Adrenalin', icon: 'ϟ', category: 'consumable', effect: 'boost', amount: 8 },
  { id: 'ammo', label: 'Munitionspaket', icon: '▤', category: 'equipment', effect: 'ammo', amount: 40 },
  { id: 'grenade', label: 'Splittergranate', icon: '✹', category: 'throwable', effect: 'grenade', amount: 95 },
  { id: 'smoke', label: 'Rauchgranate', icon: '◉', category: 'throwable', effect: 'smoke', amount: 0 },
];

export function makeWeaponItem(weapon) {
  return { weapon: { ...weapon }, ammo: weapon.ammoCapacity ?? null, reserveAmmo: weapon.reserveCapacity ?? 0, reloadRemaining: 0 };
}

export function beginReload(item) {
  if (!item?.weapon?.ammoCapacity || item.reloadRemaining > 0 || item.ammo >= item.weapon.ammoCapacity || item.reserveAmmo <= 0) return false;
  item.reloadRemaining = item.weapon.reloadTime;
  return true;
}

export function tickReload(item, delta) {
  if (!item?.reloadRemaining) return false;
  item.reloadRemaining = Math.max(0, item.reloadRemaining - delta);
  if (item.reloadRemaining > 0) return false;
  const loaded = Math.min(item.weapon.ammoCapacity - item.ammo, item.reserveAmmo);
  item.ammo += loaded;
  item.reserveAmmo -= loaded;
  return true;
}

export function shotDamage(weapon, distance, { headshot = false, charge = 1 } = {}) {
  const fraction = distance / weapon.reach;
  if (fraction > 1) return 0;
  const falloff = weapon.id === 'shotgun' ? Math.max(.15, 1 - fraction * .9) : Math.max(.5, 1 - Math.max(0, fraction - .35) * .65);
  return weapon.damage * falloff * (headshot ? (weapon.id === 'sniper' ? 2.2 : 1.7) : 1) * (weapon.id === 'bow' ? .35 + charge * .65 : 1);
}

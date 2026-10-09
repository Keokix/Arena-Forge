/** Seeded tactical maps. Every building has two clear exits and exterior flank routes. */
export const ARENA_STYLES = {
  random: 'Zufällig', open: 'Offene Arena', rooms: 'Raumkomplex', warehouse: 'Lagerhalle',
  lanes: 'Drei Wege', courtyard: 'Hofanlage', cross: 'Kreuzung', maze: 'Schleusenlabyrinth',
  outpost: 'Außenposten', depot: 'Containerdepot',
};

export function createSeededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const escapeXml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const pick = (items, random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;
const contains = (a, b, margin = 0) => b.x >= a.x + margin && b.y >= a.y + margin && b.x + b.w <= a.x + a.w - margin && b.y + b.h <= a.y + a.h - margin;

// Relative room footprints create different sightlines and silhouettes for each layout.
const ROOM_PLANS = {
  open: [[.08,.13,.2,.2,['east','north'],'armory'],[.71,.68,.21,.2,['west','south'],'lounge']],
  rooms: [[.08,.13,.23,.22,['east','north'],'office'],[.68,.66,.24,.22,['west','south'],'armory'],[.08,.65,.22,.22,['east','south'],'lounge'],[.69,.13,.23,.22,['west','north'],'office'],[.37,.35,.26,.29,['east','west','north'],'lab']],
  warehouse: [[.08,.09,.22,.2,['east','north'],'office'],[.7,.72,.22,.19,['west','south'],'armory'],[.73,.11,.19,.17,['west','south'],'lab']],
  lanes: [[.07,.1,.2,.22,['east','north'],'armory'],[.73,.68,.2,.22,['west','south'],'armory'],[.06,.69,.18,.2,['east','south'],'office'],[.76,.1,.18,.2,['west','north'],'office']],
  courtyard: [[.08,.09,.22,.22,['east','north'],'lounge'],[.7,.69,.22,.22,['west','south'],'lounge'],[.72,.1,.2,.2,['west','north'],'office'],[.08,.7,.2,.21,['east','south'],'office']],
  cross: [[.07,.1,.22,.23,['east','north'],'armory'],[.71,.67,.22,.23,['west','south'],'lab'],[.07,.68,.2,.22,['east','south'],'office'],[.73,.1,.2,.22,['west','north'],'lounge']],
  maze: [[.07,.09,.21,.2,['east','north'],'lab'],[.72,.72,.21,.19,['west','south'],'armory'],[.75,.09,.18,.17,['west','north'],'office']],
  outpost: [[.08,.11,.2,.23,['east','north'],'barracks'],[.72,.66,.2,.23,['west','south'],'armory'],[.09,.69,.19,.22,['east','south'],'lab']],
  depot: [[.07,.1,.21,.2,['east','north'],'office'],[.72,.7,.21,.2,['west','south'],'armory']],
};
const THEMES = { open: 'Training Grounds', rooms: 'Research Wing', warehouse: 'Ironworks', lanes: 'Switchyard', courtyard: 'Atrium', cross: 'Checkpoint', maze: 'Service Tunnels', outpost: 'Frontier', depot: 'Freight Terminal' };

export function generateRandomMap(random = Math.random, options = 'random') {
  const config = typeof options === 'string' ? { style: options } : (options ?? {});
  const seeded = config.seed != null && String(config.seed).trim() !== '';
  if (seeded) random = createSeededRandom(config.seed);
  const keys = Object.keys(ROOM_PLANS);
  const style = keys.includes(config.style) ? config.style : pick(keys, random);
  const mapSize = ['small','medium','large'].includes(config.mapSize) ? config.mapSize : 'medium';
  const dimensions = { small: [42,34], medium: [58,46], large: [76,58] }[mapSize];
  const W = dimensions[0] + Math.floor(random() * 4) * 2;
  const H = dimensions[1] + Math.floor(random() * 3) * 2;
  const thickness = .34, mirror = random() > .5, variant = Math.floor(random() * 3);
  const rooms = [], structures = [], props = [], doors = [], lootPoints = [];
  const start = { x: W / 2, y: 3.2 };
  const reserves = [{ x: W / 2 - 3.7, y: 0, w: 7.4, h: 6.4 }, { x: W / 2 - 3.7, y: H - 6.4, w: 7.4, h: 6.4 }];
  const insideArena = (area, margin = 2) => contains({ x: 0, y: 0, w: W, h: H }, area, margin);
  const fraction = (x, y, w, h) => ({ x: W * x, y: H * y, w: W * w, h: H * h });

  function addRoom(id, area, sides, role = 'office') {
    if (!insideArena(area, 2.2) || rooms.some((room) => overlaps(room, area, 1.3)) || reserves.some((reserve) => overlaps(reserve, area, .6))) return null;
    const room = { ...area, id, role };
    rooms.push(room);
    for (const side of sides) {
      const horizontal = side === 'south' || side === 'north';
      const width = Math.min(1.75, (horizontal ? area.w : area.h) * .35);
      const offset = .5 + (random() - .5) * .12;
      const midpoint = horizontal ? { x: area.x + area.w * offset, y: area.y + (side === 'north' ? area.h : 0) } : { x: area.x + (side === 'east' ? area.w : 0), y: area.y + area.h * offset };
      doors.push({ id: `door-${id}-${side}`, roomId: id,
        a: { x: midpoint.x - (horizontal ? width / 2 : 0), y: midpoint.y - (horizontal ? 0 : width / 2) },
        b: { x: midpoint.x + (horizontal ? width / 2 : 0), y: midpoint.y + (horizontal ? 0 : width / 2) },
        clear: { x: midpoint.x - (horizontal ? width / 2 + .35 : 1.45), y: midpoint.y - (horizontal ? 1.45 : width / 2 + .35), w: horizontal ? width + .7 : 2.9, h: horizontal ? 2.9 : width + .7 },
      });
    }
    return room;
  }

  function addWall(id, area) {
    if (!insideArena(area, 2.1) || rooms.some((room) => overlaps(room, area, 1.25)) || reserves.some((reserve) => overlaps(reserve, area, .5)) || structures.some((wall) => overlaps(wall, area, .1)) || doors.some((door) => overlaps(door.clear, area))) return false;
    structures.push({ ...area, id });
    return true;
  }

  function addProp(token, x, y, w, h, rotation = 0, category = 'equipment') {
    const rotated = Math.abs(rotation % 180) === 90;
    const footprint = { x: x - (rotated ? h : w) / 2, y: y - (rotated ? w : h) / 2, w: rotated ? h : w, h: rotated ? w : h };
    if (!insideArena(footprint, 1.8) || reserves.some((reserve) => overlaps(reserve, footprint, .5)) || structures.some((wall) => overlaps(wall, footprint, .2)) || props.some((prop) => overlaps(prop.footprint, footprint, .18)) || doors.some((door) => overlaps(door.clear, footprint, .1)) || lootPoints.some((loot) => overlaps({ x: loot.x - .8, y: loot.y - .8, w: 1.6, h: 1.6 }, footprint))) return false;
    for (const room of rooms) if (overlaps(room, footprint) && !contains(room, footprint, thickness + .15)) return false;
    props.push({ id: `obj-${style}-${token}-${props.length + 1}`, token, category, x, y, w, h, rotation, footprint });
    return true;
  }

  const targetRooms = Math.max(2, Math.min(10, Math.floor(Number(config.roomCount) || (mapSize === 'small' ? 3 : 5))));
  for (const [index, plan] of ROOM_PLANS[style].entries()) {
    if (rooms.length >= targetRooms) break;
    const [x,y,w,h,sides,role] = plan;
    const jitter = mapSize === 'small' ? 0 : (random() - .5) * .025;
    const scale = targetRooms >= 7 ? (mapSize === 'small' ? .73 : .84) : 1;
    addRoom(`sector-${index + 1}`, fraction(x + jitter + w * (1 - scale) / 2, y + h * (1 - scale) / 2, w * scale, h * scale), sides, role);
  }
  // Additional rooms are packed at edges, leaving a continuous exterior apron.
  for (let attempt = 0; rooms.length < targetRooms && attempt < 500; attempt++) {
    const compact = mapSize === 'small' || attempt > 250;
    const w = (compact ? 4.9 : 5.5) + random() * (compact ? 1.4 : 2.8), h = (compact ? 4.3 : 4.8) + random() * (compact ? 1.2 : 2.4), edge = attempt % 4;
    const x = attempt < 200 && edge === 0 ? 2.7 : attempt < 200 && edge === 1 ? W - w - 2.7 : 2.7 + random() * (W - w - 5.4);
    const y = attempt < 200 && edge === 2 ? 2.7 : attempt < 200 && edge === 3 ? H - h - 2.7 : 2.7 + random() * (H - h - 5.4);
    addRoom(`annex-${rooms.length + 1}`, { x,y,w,h }, edge < 2 ? ['north','south'] : ['east','west'], pick(['office','armory','lounge'], random));
  }
  // A bounded grid fallback honours high room counts without overlapping walls.
  for (let gy = 3; rooms.length < targetRooms && gy < H - 7; gy += 5.9) for (let gx = 3; rooms.length < targetRooms && gx < W - 7; gx += 6.5) {
    addRoom(`annex-${rooms.length + 1}`, { x: gx,y: gy,w: 4.9,h: 4.4 }, ['east','west'], 'office');
  }

  if (style === 'lanes') {
    for (const [index,laneX] of [.35,.65].entries()) for (let section = 0; section < 3; section++) addWall(`lane-${index}-${section}`, fraction(laneX,.12 + section * .28,.018,.16 + (variant === section ? .03 : 0)));
  } else if (style === 'cross' || style === 'rooms') {
    const parts = style === 'cross' ? [[.34,.31,.15,.02],[.53,.68,.14,.02],[.3,.51,.02,.16],[.68,.32,.02,.15]] : [[.33,.13,.025,.12],[.64,.72,.025,.13],[.08,.46,.15,.022],[.77,.49,.15,.022]];
    for (const [index,area] of parts.entries()) addWall(`partition-${index}`, fraction(...area));
  } else if (style === 'maze') {
    for (let index = 0; index < 5; index++) {
      const x = .22 + index * .13, y = index % 2 ? .29 : .49;
      addWall(`baffle-${index}`, fraction(x,y,.022,.28));
      if (index % 2 === variant % 2) addWall(`baffle-wing-${index}`, fraction(x + .022,y + .12,.075,.018));
    }
  }

  // Loot pockets are reserved before any props are placed inside the buildings.
  for (const [index,room] of rooms.entries()) {
    const candidates = [[.95,.95],[room.w - .95,.95],[.95,room.h - .95],[room.w - .95,room.h - .95]].map(([x,y]) => ({ x: room.x + x,y: room.y + y }));
    const roomDoors = doors.filter((door) => door.roomId === room.id);
    const score = (candidate) => Math.min(...roomDoors.map((door) => Math.hypot(candidate.x - (door.a.x + door.b.x) / 2,candidate.y - (door.a.y + door.b.y) / 2)));
    candidates.sort((a,b) => score(b) - score(a));
    lootPoints.push({ ...candidates[0],kind: ['weapon','medical','supply'][index % 3] });
  }
  const interior = (room, token, fx, fy, w, h, rotation = 0, category = 'furniture') => addProp(token, room.x + room.w * fx, room.y + room.h * fy, w, h, rotation, category);
  for (const room of rooms) {
    if (room.role === 'office' || room.role === 'lab') {
      interior(room,'desk',.25,.25,1.8,.85);
      interior(room,'chair',.25,.43,.55,.55);
      interior(room,room.role === 'lab' ? 'console' : 'cabinet',.25,.76,1.45,.65,0,'equipment');
      interior(room,room.role === 'lab' ? 'machine' : 'planter',.73,.24,1.1,.8,0,'equipment');
    } else if (room.role === 'lounge' || room.role === 'barracks') {
      interior(room,room.role === 'barracks' ? 'bed' : 'sofa',.24,.26,1.8,room.role === 'barracks' ? 2 : .9);
      interior(room,room.role === 'barracks' ? 'closet' : 'coffeetable',.28,.76,1.4,.6);
      interior(room,'bench',.74,.22,1.8,.55);
      interior(room,'planter',.2,.8,.65,.65);
    } else {
      interior(room,'rack',.23,.26,2.2,.8,0,'equipment');
      interior(room,'crate',.24,.73,1.2,1.1,0,'equipment');
      interior(room,'console',.72,.25,1.4,.75,0,'equipment');
      interior(room,'barrel',.78,.43,.7,.7,0,'equipment');
    }
  }

  const propAt = (token, fx, fy, w, h, rotation = 0) => addProp(token,W * fx,H * fy,w,h,rotation);
  const clusters = [];
  if (style === 'warehouse') {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const fx = .3 + col * .17 + (row % 2 ? .035 : 0), fy = .34 + row * .16;
      propAt('rack',fx,fy,4.4,1.2,variant === 1 ? 90 : 0);
      if ((row + col) % 2 === 0) propAt('crate',fx - .035,fy + .065,1.1,1.1);
    }
    clusters.push([.18,.49],[.85,.48],[.45,.22],[.62,.8]);
  } else if (style === 'depot') {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) propAt('container',.3 + col * .2,.28 + row * .23,6.6,2.5,(row + variant) % 2 ? 90 : 0);
    clusters.push([.17,.5],[.83,.48],[.5,.49],[.36,.84]);
  } else if (style === 'courtyard') {
    for (const [fx,fy,w,h] of [[.4,.36,3.2,1.1],[.6,.36,3.2,1.1],[.4,.65,3.2,1.1],[.6,.65,3.2,1.1],[.33,.51,1.1,3.2],[.68,.51,1.1,3.2]]) propAt('planter',fx,fy,w,h);
    propAt('console',.5,.51,2.4,1.8);
    for (const [fx,fy] of [[.36,.29],[.65,.72],[.25,.51],[.76,.51]]) propAt('bench',fx,fy,2,.65);
    clusters.push([.44,.2],[.58,.81]);
  } else if (style === 'outpost') {
    for (const [fx,fy,rotation] of [[.34,.3,0],[.66,.72,0],[.4,.5,90],[.61,.45,90],[.5,.29,0],[.5,.73,0]]) {
      propAt('sandbag',fx,fy,3.2,.75,rotation);
      propAt('barrel',fx + .03,fy + .055,.75,.75);
    }
    propAt('container',.8,.46,5.2,2.2,90);
    clusters.push([.2,.47],[.46,.59],[.72,.3]);
  } else {
    const phase = variant === 0 ? 0 : .035;
    clusters.push([.35 + phase,.28],[.65,.31 + phase],[.28,.54],[.72,.54],[.36,.73],[.65 - phase,.73],[.46,.45],[.57,.59]);
    if (style === 'open') {
      propAt('barricade',.5,.35,4,.65);
      propAt('barricade',.5,.67,4,.65);
      propAt('container',.21,.5,4.8,2.1,90);
      propAt('container',.79,.5,4.8,2.1,90);
    }
  }
  for (const [index,[fx,fy]] of clusters.entries()) {
    const token = style === 'outpost' ? 'sandbag' : index % 3 === 0 ? 'barricade' : 'crate';
    propAt(token,fx,fy,token === 'barricade' ? 2.1 : 1.3,token === 'barricade' ? .65 : 1.1,index % 2 ? 90 : 0);
    if (index % 2 === 0) propAt('barrel',fx + .035,fy + .035,.7,.7);
  }
  const targetProps = Math.round(W * H / (style === 'rooms' ? 100 : 84));
  for (let attempt = 0; props.length < targetProps && attempt < 400; attempt++) {
    const token = pick(style === 'courtyard' ? ['planter','bench','crate'] : style === 'outpost' ? ['sandbag','barrel','crate'] : ['crate','barrel','barricade'],random);
    const w = token === 'barricade' || token === 'sandbag' ? 2.1 + random() * 1.1 : token === 'bench' ? 1.8 : .85 + random() * .45;
    const h = token === 'barricade' || token === 'sandbag' ? .65 : token === 'bench' ? .6 : w * .9;
    const x = 3 + random() * (W - 6), y = 3 + random() * (H - 6);
    if (rooms.some((room) => contains(room,{ x,y,w: 0,h: 0 }))) continue;
    addProp(token,x,y,w,h,random() < .5 ? 0 : 90);
  }

  const transform = (p) => ({ x: mirror ? W - p.x : p.x, y: p.y });
  const point = (p) => { const q = transform(p); return `${q.x.toFixed(2)},${q.y.toFixed(2)}`; };
  const rect = (area) => [{ x: area.x,y: area.y },{ x: area.x + area.w,y: area.y },{ x: area.x + area.w,y: area.y + area.h },{ x: area.x,y: area.y + area.h }].map(point).join(';');
  const sets = [`<ContourSet id="perimeter" type="shell"><OuterContour id="perimeter-outer" contour="${rect({ x: 0,y: 0,w: W,h: H })}"/><InnerContours><InnerContour id="arena-floor" contour="${rect({ x: thickness,y: thickness,w: W - thickness * 2,h: H - thickness * 2 })}"/></InnerContours></ContourSet>`];
  const spaces = ['<Space id="space-arena-floor" contourRef="arena-floor" usage="room"/>'];
  for (const room of rooms) {
    sets.push(`<ContourSet id="shell-${room.id}" type="shell"><OuterContour id="shell-${room.id}-outer" contour="${rect(room)}"/><InnerContours><InnerContour id="room-${room.id}" contour="${rect({ x: room.x + thickness,y: room.y + thickness,w: room.w - thickness * 2,h: room.h - thickness * 2 })}"/></InnerContours></ContourSet>`);
    spaces.push(`<Space id="space-${room.id}" contourRef="room-${room.id}" usage="room"/>`);
  }
  for (const wall of structures) sets.push(`<ContourSet id="${wall.id}" type="solid"><OuterContour id="${wall.id}-outer" contour="${rect(wall)}"/></ContourSet>`);
  const openings = doors.map((door) => `<Opening id="${door.id}" category="door"><OpeningLine contourRef="shell-${door.roomId}-outer" line="${point(door.a)};${point(door.b)}"/></Opening>`);
  const objects = props.map((prop) => { const p = transform(prop); return `<PlanObject id="${prop.id}" category="${prop.category}"><Placement x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" rotation="${mirror ? -prop.rotation : prop.rotation}"/><Size x="${prop.w.toFixed(2)}" y="${prop.h.toFixed(2)}"/></PlanObject>`; });
  const anchor = (name,p,extra = '') => { const q = transform(p); return `<${name} x="${q.x.toFixed(2)}" y="${q.y.toFixed(2)}"${extra}/>`; };
  const spawn = anchor('Spawn',start,` lookX="${(W / 2).toFixed(2)}" lookY="${(H / 2).toFixed(2)}"`);
  const enemySpawns = [{ x: W / 2,y: H - 3.2 },{ x: 1.1,y: H / 2 },{ x: W - 1.1,y: H / 2 }].map((p) => anchor('Spawn',p)).join('');
  const lootXml = lootPoints.map((p) => anchor('LootPoint',p,` kind="${p.kind}"`)).join('');
  const landmarks = [{ id: 'mid',label: 'Zentrum',x: W / 2,y: H / 2 },{ id: 'west',label: 'Westflanke',x: 1.1,y: H / 2 },{ id: 'east',label: 'Ostflanke',x: W - 1.1,y: H / 2 }].map((p) => anchor('Landmark',p,` id="${p.id}" label="${p.label}"`)).join('');
  const header = `<ProjectName>${ARENA_STYLES[style]} · ${THEMES[style]}</ProjectName><CreatedWith>Arena Forge</CreatedWith><Seed>${escapeXml(seeded ? config.seed : '')}</Seed><Layout>${style}</Layout><MapSize>${mapSize}</MapSize><Theme>${THEMES[style]}</Theme><SpawnPoints>${spawn}<EnemySpawns>${enemySpawns}</EnemySpawns></SpawnPoints><LootPoints>${lootXml}</LootPoints><Landmarks>${landmarks}</Landmarks>`;
  return `<?xml version="1.0" encoding="UTF-8"?><ArenaData><Header>${header}</Header><Storey id="arena-storey" height="3.6"><ContourSets>${sets.join('')}</ContourSets><Spaces>${spaces.join('')}</Spaces><Openings>${openings.join('')}</Openings><PlanObjects>${objects.join('')}</PlanObjects></Storey></ArenaData>`;
}

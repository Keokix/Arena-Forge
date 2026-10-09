import {
  passagePolygon,
  footprintCorners,
  alignLineToPolygons,
} from "./geom.js";
import {
  DOOR_PASSAGE_DEPTH_M,
  DEFAULT_STOREY_HEIGHT_M,
} from "./game-constants.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export function parseXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("DTD und eigene XML-Entities werden nicht unterstützt.");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Ungültiges XML: ${valid.err.msg}`);
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  function convert(items) {
    return items.flatMap((item) => {
      const name = Object.keys(item).find((k) => k !== ":@");
      if (!name || name.startsWith("?") || name === "#text") return [];
      return [
        {
          name,
          attrs: item[":@"] ?? {},
          text: item[name]
            .filter((v) => "#text" in v)
            .map((v) => v["#text"])
            .join(""),
          children: convert(item[name]),
        },
      ];
    });
  }
  return convert(parser.parse(xml))[0] ?? null;
}

function child(el, name) {
  return el?.children.find((item) => item.name === name) ?? null;
}

function children(el, name) {
  return el?.children.filter((item) => item.name === name) ?? [];
}

function num(value, fallback = 0) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (value === "" || !Number.isFinite(parsed))
    throw new Error(`Ungültige Zahl: ${value}`);
  return parsed;
}

function optionalNum(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseContour(text) {
  if (!text) return [];
  return text
    .split(";")
    .filter(Boolean)
    .map((pair) => {
      const parts = pair.trim().split(",");
      if (parts.length !== 2 || parts.some((v) => !v.trim()))
        throw new Error("Ungültiger Konturpunkt.");
      const [x, y] = parts;
      return { x: num(x), y: num(y) };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function parseLine(text) {
  const points = parseContour(text);
  if (
    points.length !== 2 ||
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) < 1e-8
  )
    throw new Error("Eine Öffnung benötigt zwei verschiedene Punkte.");
  return [points[0], points[1]];
}

export function parseArenaData(xmlText) {
  const root = parseXml(xmlText);
  if (!root || root.name !== "ArenaData") {
    throw new Error("Ungültige Arena-Daten.");
  }

  const header = child(root, "Header");
  const storey = child(root, "Storey");
  if (!storey) throw new Error("Die Datei enthält kein Storey-Element.");

  const contours = new Map();
  const contourSets = children(child(storey, "ContourSets"), "ContourSet").map(
    (setEl) => {
      const outerEl = child(setEl, "OuterContour");
      const outer = {
        id: outerEl?.attrs.id ?? "",
        points: parseContour(outerEl?.attrs.contour),
        confidence: optionalNum(outerEl?.attrs.confidence),
      };
      if (outer.id)
        contours.set(outer.id, {
          ...outer,
          kind: "outer",
          setId: setEl.attrs.id,
          setType: setEl.attrs.type,
        });
      const holes = children(child(setEl, "InnerContours"), "InnerContour").map(
        (holeEl) => {
          const hole = {
            id: holeEl.attrs.id ?? "",
            points: parseContour(holeEl.attrs.contour),
            confidence: optionalNum(holeEl.attrs.confidence),
          };
          if (hole.id)
            contours.set(hole.id, {
              ...hole,
              kind: "inner",
              setId: setEl.attrs.id,
              setType: setEl.attrs.type,
            });
          return hole;
        },
      );
      return {
        id: setEl.attrs.id ?? "",
        type: setEl.attrs.type ?? "shell",
        confidence: optionalNum(setEl.attrs.confidence),
        outer,
        holes,
      };
    },
  );

  const spaces = children(child(storey, "Spaces"), "Space").map((spaceEl) => ({
    id: spaceEl.attrs.id ?? "",
    contourRef: spaceEl.attrs.contourRef ?? "",
    usage: spaceEl.attrs.usage ?? "room",
    confidence: optionalNum(spaceEl.attrs.confidence),
    points: contours.get(spaceEl.attrs.contourRef)?.points ?? [],
  }));

  const rawOpenings = children(child(storey, "Openings"), "Opening").map(
    (openingEl) => {
      const lineEl = child(openingEl, "OpeningLine");
      const line = parseLine(lineEl?.attrs.line);
      return {
        id: openingEl.attrs.id ?? "",
        category: openingEl.attrs.category ?? "unknown",
        confidence: optionalNum(
          openingEl.attrs.confidence ?? lineEl?.attrs.confidence,
        ),
        contourRef: lineEl?.attrs.contourRef ?? "",
        line,
      };
    },
  );
  const wallPolygons = contourSets
    .filter((set) => set.type === "shell")
    .flatMap((set) => [
      set.outer.points,
      ...set.holes.map((hole) => hole.points),
    ]);
  const openings = rawOpenings.map((opening) => {
    if (opening.category !== "door")
      return {
        ...opening,
        alignedLine: opening.line,
        alignment: { snapped: false, distance: 0 },
      };
    const alignment = alignLineToPolygons(opening.line, wallPolygons);
    return { ...opening, alignedLine: alignment.line, alignment };
  });

  const planObjects = children(child(storey, "PlanObjects"), "PlanObject").map(
    (objectEl) => {
      const placement = child(objectEl, "Placement");
      const size = child(objectEl, "Size");
      const place = {
        x: num(placement?.attrs.x),
        y: num(placement?.attrs.y),
        rotation: num(placement?.attrs.rotation, 0),
      };
      const footprint = { x: num(size?.attrs.x), y: num(size?.attrs.y) };
      return {
        id: objectEl.attrs.id ?? "",
        category: objectEl.attrs.category ?? "unknown",
        confidence: optionalNum(objectEl.attrs.confidence),
        placement: place,
        size: footprint,
        corners: footprintCorners(place, footprint),
      };
    },
  );

  const height = num(storey.attrs.height, DEFAULT_STOREY_HEIGHT_M);
  if (height <= 0) throw new Error("Die Geschosshöhe muss positiv sein.");
  if (!contourSets.length) throw new Error("Keine Konturen vorhanden.");
  const ids = new Set();
  for (const set of contourSets) {
    if (!["shell", "solid", "outdoor"].includes(set.type))
      throw new Error(`Unbekannter Konturtyp: ${set.type}`);
    for (const contour of [set.outer, ...set.holes]) {
      if (!contour.id || ids.has(contour.id))
        throw new Error(`Fehlende oder doppelte Kontur-ID: ${contour.id}`);
      ids.add(contour.id);
      if (contour.points.length < 3)
        throw new Error(
          `Kontur ${contour.id} benötigt mindestens drei Punkte.`,
        );
    }
  }
  for (const ref of [...spaces, ...openings]) {
    if (!contours.has(ref.contourRef))
      throw new Error(`Unbekannte Konturreferenz: ${ref.contourRef}`);
  }
  for (const obj of planObjects) {
    if (obj.size.x <= 0 || obj.size.y <= 0)
      throw new Error(`Objekt ${obj.id}: Abmessungen müssen positiv sein.`);
  }
  const doorPassages = openings
    .filter((opening) => opening.category === "door" && opening.line)
    .map((opening) => ({
      id: opening.id,
      points: passagePolygon(
        opening.alignedLine[0],
        opening.alignedLine[1],
        DOOR_PASSAGE_DEPTH_M,
      ),
    }));

  return {
    gameMetadata: {
      seed: headerText(header, 'Seed'),
      style: headerText(header, 'Layout'),
      theme: headerText(header, 'Theme'),
      spawn: children(child(header, 'SpawnPoints'), 'Spawn').map(el => ({ x: num(el.attrs.x), y: num(el.attrs.y), lookX: num(el.attrs.lookX), lookY: num(el.attrs.lookY) }))[0] ?? null,
      enemies: children(child(child(header, 'SpawnPoints'), 'EnemySpawns'), 'Spawn').map(el => ({ x: num(el.attrs.x), y: num(el.attrs.y) })),
      loot: children(child(header, 'LootPoints'), 'LootPoint').map(el => ({ x: num(el.attrs.x), y: num(el.attrs.y), kind: el.attrs.kind })),
      landmarks: children(child(header, 'Landmarks'), 'Landmark').map(el => ({ id: el.attrs.id, label: el.attrs.label, x: num(el.attrs.x), y: num(el.attrs.y) })),
    },
    projectName:
      child(header, "ProjectName")?.text ?? headerText(header, "ProjectName"),
    storey: {
      id: storey.attrs.id ?? "",
      height,
      confidence: optionalNum(storey.attrs.confidence),
    },
    contourSets,
    contours,
    spaces,
    openings,
    planObjects,
    doorPassages,
  };
}

function headerText(header, name) {
  const el = child(header, name);
  if (!el) return "";
  return (el.text ?? el.attrs.value ?? "").trim();
}

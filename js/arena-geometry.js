import clipping from "polygon-clipping";
import { pointInPolygon } from "./geom.js";

const toRing = (points) => points.map((point) => [point.x, point.y]);

function roomGeometry(arena, space) {
  let walkable = [[toRing(space.points)]];
  if (space.usage === "outdoor") return walkable;

  const owner = arena.contours.get(space.contourRef)?.setId;
  for (const contourSet of arena.contourSets) {
    if (contourSet.id === owner || contourSet.type === "outdoor") continue;
    const isInsideRoom = contourSet.outer.points.every((point) =>
      pointInPolygon(point, space.points),
    );
    if (contourSet.type === "shell" && !isInsideRoom) continue;
    walkable = clipping.difference(walkable, [toRing(contourSet.outer.points)]);
  }
  return walkable;
}

/** Converts generated arena spaces into walkable polygons for the renderer. */
export function buildArenaRows(arena) {
  return arena.spaces.map((space) => ({
    id: space.id,
    usage: space.usage,
    geometry: roomGeometry(arena, space),
  }));
}

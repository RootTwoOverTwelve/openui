import type { Node, Viewport } from "@xyflow/react";

// Where new things go on the canvas. One set of rules for agents,
// categories, restored nodes and forks:
//  - spawn in the part of the canvas the user can actually see (the session
//    panel covers the right side when open)
//  - never overlap an existing card; use real measured sizes and resolve
//    group offsets, since children of a category have relative positions
//  - forks sit beside their parent
//  - a node placed inside a category joins it, like dropping it there would

export const GRID = 24;
export const AGENT_SIZE = { width: 400, height: 250 };
export const CATEGORY_SIZE = { width: 456, height: 312 };

export interface Size { width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

const snap = (v: number) => Math.round(v / GRID) * GRID;

export function nodeSize(node: any, fallback: Size): Size {
  const width = node.measured?.width || node.width ||
    (typeof node.style?.width === "number" ? node.style.width : parseInt(node.style?.width) || fallback.width);
  const height = node.measured?.height || node.height ||
    (typeof node.style?.height === "number" ? node.style.height : parseInt(node.style?.height) || fallback.height);
  return { width, height };
}

// Absolute canvas rect of a node, following parentId
export function absoluteRect(node: any, byId: Map<string, any>): Rect {
  const size = nodeSize(node, node.type === "category" ? CATEGORY_SIZE : AGENT_SIZE);
  let x = node.position.x, y = node.position.y;
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent) {
    x += parent.position.x; y += parent.position.y;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return { x, y, ...size };
}

function overlaps(a: Rect, b: Rect, margin = GRID): boolean {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x &&
         a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}

// Centre of the visible canvas in flow coordinates. `covered` is how much of
// the right edge is hidden by the session panel.
export function visibleCenter(viewport: Viewport, covered = 0): { x: number; y: number } {
  const bounds = document.querySelector(".react-flow")?.getBoundingClientRect();
  const w = Math.max(200, (bounds?.width || window.innerWidth) - covered);
  const h = bounds?.height || window.innerHeight;
  return { x: (w / 2 - viewport.x) / viewport.zoom, y: (h / 2 - viewport.y) / viewport.zoom };
}

interface FindOptions {
  // Extra rects to keep clear of (e.g. siblings placed in the same batch)
  avoid?: Rect[];
  // Categories are normally not obstacles (a node may land in one and join
  // it); pass true when placing a category so groups don't nest visually
  avoidCategories?: boolean;
}

// Nearest free top-left for a box of `size` around `near` (the box's
// centre), searching outward in square rings on a half-card step
export function findFreeSpot(nodes: Node[], size: Size, near: { x: number; y: number }, opts: FindOptions = {}): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const obstacles: Rect[] = nodes
    .filter((n) => n.type === "agent" || (opts.avoidCategories && n.type === "category"))
    .map((n) => absoluteRect(n, byId))
    .concat(opts.avoid || []);

  const origin = { x: snap(near.x - size.width / 2), y: snap(near.y - size.height / 2) };
  const stepX = snap(size.width / 2) || GRID, stepY = snap(size.height / 2) || GRID;
  const free = (x: number, y: number) => !obstacles.some((o) => overlaps({ x, y, ...size }, o));

  if (free(origin.x, origin.y)) return origin;
  for (let r = 1; r <= 40; r++) {
    // Walk the ring nearest-first-ish: sides before corners
    const ring: { x: number; y: number }[] = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      ring.push({ x: origin.x + dx * stepX, y: origin.y + dy * stepY });
    }
    ring.sort((a, b) => (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2 - ((b.x - origin.x) ** 2 + (b.y - origin.y) ** 2));
    for (const p of ring) if (free(p.x, p.y)) return p;
  }
  return origin;
}

// Right of the anchor, else below, left, above; else nearest free spot
export function placeBeside(anchor: Node, nodes: Node[], size: Size, opts: FindOptions = {}): { x: number; y: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const a = absoluteRect(anchor, byId);
  const obstacles = nodes
    .filter((n) => n.type === "agent")
    .map((n) => absoluteRect(n, byId))
    .concat(opts.avoid || []);
  const candidates = [
    { x: a.x + a.width + GRID, y: a.y },
    { x: a.x, y: a.y + a.height + GRID },
    { x: a.x - size.width - GRID, y: a.y },
    { x: a.x, y: a.y - size.height - GRID },
  ].map((p) => ({ x: snap(p.x), y: snap(p.y) }));
  for (const p of candidates) {
    if (!obstacles.some((o) => overlaps({ ...p, ...size }, o, 0))) return p;
  }
  return findFreeSpot(nodes, size, { x: a.x + a.width + GRID + size.width / 2, y: a.y + size.height / 2 }, opts);
}

// The category whose box contains a point, if any
export function containingCategory(point: { x: number; y: number }, nodes: Node[]): Node | undefined {
  return nodes.find((n) => {
    if (n.type !== "category") return false;
    const s = nodeSize(n, CATEGORY_SIZE);
    return point.x >= n.position.x && point.x <= n.position.x + s.width &&
           point.y >= n.position.y && point.y <= n.position.y + s.height;
  });
}

// Turn an absolute top-left into what React Flow needs: relative position
// plus parentId when the box's centre falls inside a category
export function toNodePlacement(abs: { x: number; y: number }, size: Size, nodes: Node[]): { position: { x: number; y: number }; parentId?: string } {
  const cat = containingCategory({ x: abs.x + size.width / 2, y: abs.y + size.height / 2 }, nodes);
  if (!cat) return { position: abs };
  return { position: { x: snap(abs.x - cat.position.x), y: snap(abs.y - cat.position.y) }, parentId: cat.id };
}

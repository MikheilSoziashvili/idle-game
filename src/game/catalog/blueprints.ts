import type { Blueprint } from '../engine/types';

// Starter Terraform "modules". Granted when their nodes unlock; the player's own
// saved blueprints join these. Coordinates are relative to the stamp point.
export const STARTER_BLUEPRINTS: Blueprint[] = [
  {
    id: 'bp-web-tier',
    name: 'module.web_tier',
    builtin: true,
    nodes: [
      { kind: 'lb', dx: 0, dy: 60, level: 1 },
      { kind: 'nginx', dx: 220, dy: 0, level: 1 },
      { kind: 'nginx', dx: 220, dy: 120, level: 1 },
    ],
    edges: [
      { si: 0, sh: 'http-out', ti: 1, th: 'http-in' },
      { si: 0, sh: 'http-out', ti: 2, th: 'http-in' },
    ],
  },
  {
    id: 'bp-cached-db',
    name: 'module.cached_db',
    builtin: true,
    nodes: [
      { kind: 'redis', dx: 0, dy: 0, level: 1 },
      { kind: 'postgres', dx: 220, dy: 0, level: 1 },
    ],
    edges: [{ si: 0, sh: 'data-out', ti: 1, th: 'data-in' }],
  },
  {
    id: 'bp-async',
    name: 'module.async_pipeline',
    builtin: true,
    nodes: [
      { kind: 'queue', dx: 0, dy: 60, level: 1 },
      { kind: 'worker', dx: 220, dy: 0, level: 1 },
      { kind: 'worker', dx: 220, dy: 120, level: 1 },
    ],
    edges: [
      { si: 0, sh: 'jobs-out', ti: 1, th: 'jobs-in' },
      { si: 0, sh: 'jobs-out', ti: 2, th: 'jobs-in' },
    ],
  },
  {
    id: 'bp-edge',
    name: 'module.edge_static',
    builtin: true,
    nodes: [
      { kind: 'cdn', dx: 0, dy: 0, level: 1 },
      { kind: 's3', dx: 220, dy: 0, level: 1 },
    ],
    edges: [{ si: 0, sh: 'http-out', ti: 1, th: 'http-in' }],
  },
];

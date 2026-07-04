import type { TierDef } from '../engine/types';

// Workload tiers — the "file types" of UPTIME. Each launched tier adds its own
// traffic stream (mix over CLASSES = [static, api, read, write, job]) and value.
// Launching a tier you can't serve tanks uptime and reputation: a real decision.
export const TIERS: TierDef[] = [
  {
    id: 1,
    key: 'static',
    name: 'Static Site',
    blurb: 'Marketing pages and a blog. Hobby traffic, all static. Learn the ropes.',
    baseRps: 6,
    mix: [1, 0, 0, 0, 0],
    value: [0.05, 0, 0, 0, 0],
    cost: 0,
  },
  {
    id: 2,
    key: 'api',
    name: 'Dynamic API',
    blurb: 'A public REST API. Compute-bound requests appear — static-only servers will choke.',
    baseRps: 7,
    mix: [0.55, 0.45, 0, 0, 0],
    value: [0.05, 0.12, 0, 0, 0],
    cost: 400,
  },
  {
    id: 3,
    key: 'accounts',
    name: 'Accounts + Database',
    blurb: 'User accounts. Reads and writes hit a shared database — this is why caches exist.',
    baseRps: 8,
    mix: [0.35, 0.2, 0.3, 0.15, 0],
    value: [0.05, 0.12, 0.18, 0.28, 0],
    cost: 1200,
    research: 'caching',
  },
  {
    id: 4,
    key: 'search',
    name: 'Search / Analytics',
    blurb: 'Heavy async compute. Queue it or drown — spikes are unbuyable without buffering.',
    baseRps: 9,
    mix: [0.3, 0.2, 0.25, 0.1, 0.15],
    value: [0.05, 0.12, 0.18, 0.28, 0.5],
    cost: 2500,
    research: 'queues',
  },
  {
    id: 5,
    key: 'realtime',
    name: 'Real-time Platform',
    blurb: 'Websockets and live sync. Latency-critical: slow responses are worth pennies.',
    baseRps: 12,
    mix: [0.2, 0.3, 0.35, 0.1, 0.05],
    value: [0.07, 0.17, 0.25, 0.39, 0.5],
    cost: 6000,
    research: 'cdn',
    roundGate: 1,
    latencySensitive: true,
  },
  {
    id: 6,
    key: 'ml',
    name: 'ML Inference',
    blurb: 'AI features at big-tech scale. Expensive jobs, enormous value. Bring GPUs (workers).',
    baseRps: 10,
    mix: [0.15, 0.2, 0.25, 0.1, 0.3],
    value: [0.07, 0.17, 0.25, 0.39, 1.1],
    cost: 15000,
    research: 'mlpipe',
    roundGate: 2,
  },
];

export const tierById = (id: number): TierDef => TIERS[id - 1];

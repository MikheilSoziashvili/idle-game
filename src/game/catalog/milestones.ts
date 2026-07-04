import type { MilestoneDef } from '../engine/types';

// Guided objectives for the first session. Checked in order (engine checks the
// first incomplete one plus any "background" ones); completing one toasts and
// pays out. These also gate tools Cities-style — see store.unlockedTools.
export const MILESTONES: MilestoneDef[] = [
  {
    id: 'first-wire',
    title: 'Hello, world',
    desc: 'Wire the Internet to a server and serve your first request.',
    hint: 'Drag Nginx from the palette onto the canvas, then drag from the Internet\'s port to its port.',
    rewardCash: 75,
  },
  {
    id: 'ten-rps',
    title: 'Double digits',
    desc: 'Serve 10 requests per second.',
    hint: 'Traffic grows on its own while your reputation holds. Watch the RPS gauge.',
    rewardCash: 100,
  },
  {
    id: 'first-bottleneck',
    title: 'Growing pains',
    desc: 'Recover from your first bottleneck: stop the drops and beat your previous peak.',
    hint: 'A red edge means a saturated node. Add a Load Balancer with a second server, or upgrade in place.',
    rewardCash: 150,
  },
  {
    id: 'observability',
    title: "Can't fix what you can't see",
    desc: 'Deploy Prometheus.',
    hint: 'Prometheus turns served traffic into Research Points and unlocks canvas overlays.',
    unlocks: 'Overlays + Research tree',
  },
  {
    id: 'first-cache',
    title: 'The $80 problem',
    desc: 'Research Caching and serve 30% of reads from Redis.',
    hint: 'Wire App → Redis → Postgres. Cache hits never touch the database.',
    rewardCash: 200,
  },
  {
    id: 'hands-off',
    title: 'Hands off',
    desc: 'Let an Autoscaler complete a scaling action on a Zone.',
    hint: 'Research Autoscaling, draw a Zone (Z), then wire an Autoscaler\'s control port to it.',
    rewardCash: 300,
  },
  {
    id: 'tier-two',
    title: 'Product-market fit',
    desc: 'Launch the Dynamic API product tier.',
    hint: 'New workloads mean new money and new bottlenecks. App Servers complete API calls.',
    unlocks: 'Region tool + Blueprints',
  },
  {
    id: 'spike-survivor',
    title: 'Hug of death',
    desc: 'Survive a traffic spike with under 2% drops.',
    hint: 'Headroom, autoscaling and queues turn spikes into revenue instead of an outage.',
    rewardRp: 20,
  },
  {
    id: 'auto-billing',
    title: 'Send the invoices (never again)',
    desc: 'Deploy Stripe Billing to automate revenue collection.',
    hint: 'Until then, revenue settles slowly — or click "Invoice" on the dashboard to collect now.',
    rewardCash: 150,
  },
  {
    id: 'series-ready',
    title: 'Series ready',
    desc: 'Bank enough traction for a funding round (2 Scale Points pending).',
    hint: 'Open the Prestige panel to see projected Scale Points. Save a blueprint before you raise.',
  },
];

export const milestoneById = new Map(MILESTONES.map((m) => [m.id, m]));

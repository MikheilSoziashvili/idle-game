import type { AchievementDef } from '../engine/types';

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-dollar', name: 'Ramen Profitable', desc: 'Earn your first dollar.', icon: '$' },
  { id: 'first-cache', name: 'Cache Rules Everything', desc: 'Put a Redis in front of your database.', icon: '⚡' },
  { id: 'balanced', name: 'Horizontal Thinking', desc: 'Split traffic with a Load Balancer.', icon: '⇶' },
  { id: 'automated', name: 'Hands Off', desc: 'An autoscaler performs its first scaling action.', icon: '⇕' },
  { id: 'self-driving', name: 'Self-driving Platform', desc: 'Autoscaler, Kubernetes, CI/CD and Stripe all running at once.', icon: '⚙' },
  { id: 'hug-of-death', name: 'Hug of Death, Survived', desc: 'Ride out a traffic spike with under 2% drops.', icon: '🛡' },
  { id: 'four-nines', name: 'Four Nines', desc: 'Hold 99.99% uptime for 5 straight minutes.', icon: '✓' },
  { id: 'speed-demon', name: 'Speed Demon', desc: 'p95 under 50ms while serving 100+ RPS.', icon: '≪' },
  { id: 'kilo-rps', name: 'Three Commas of QPS', desc: 'Serve 1,000 requests per second.', icon: 'K' },
  { id: 'terraformed', name: 'Terraformed', desc: 'Stamp a blueprint onto the canvas.', icon: '⌗' },
  { id: 'exit-strategy', name: 'Term Sheet', desc: 'Raise your first funding round.', icon: '📈' },
  { id: 'money-printer', name: 'Money Printer', desc: 'Sustain $100/s profit.', icon: '⎙' },
  // --- combo discoveries (hidden synergies worth finding) ---
  { id: 'layered-cache', name: 'Layered Cache', desc: 'An edge CDN and a Varnish both landing hits at once.', icon: '≣' },
  { id: 'cache-hierarchy', name: 'Cache Hierarchy', desc: 'Redis and Memcached both serving hits at once.', icon: '⧉' },
  { id: 'chaos-native', name: 'Chaos Native', desc: '3+ Spot instances under Kubernetes at 99%+ uptime.', icon: '☈' },
  { id: 'polyglot', name: 'Polyglot Persistence', desc: 'Three different database engines serving at once.', icon: '⛁' },
  // --- live-ops ---
  { id: 'dealmaker', name: 'Dealmaker', desc: 'Complete 10 SLA contracts.', icon: '✍' },
  { id: 'fire-drill', name: 'Fire Marshal', desc: 'A 7-day chaos-drill streak.', icon: '🔥' },
  { id: 'flippening', name: 'The Flippening', desc: 'Raise a round while out-serving your rival.', icon: '⚔' },
  // --- constraint runs ---
  { id: 'went-serverless', name: 'We Went Serverless', desc: 'Raise a round on a serverless-only run.', icon: 'λ' },
  { id: 'raw-dog-db', name: 'No Cache, No Mercy', desc: 'Raise a round without ever building a cache.', icon: '⊘' },
  { id: 'level-one-legend', name: 'Level One Legend', desc: 'Raise a round without upgrading a single node.', icon: '①' },
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

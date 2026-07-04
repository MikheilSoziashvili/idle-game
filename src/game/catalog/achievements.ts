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
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

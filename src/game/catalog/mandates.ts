import type { MandateDef, MandateId } from '../engine/types';

// Board mandates: optional risk/reward modifiers chosen when raising a round.
// The chosen mandate applies to the NEXT run; its SP bonus pays out when that
// run is itself raised. Effects are applied in economy.computeMods,
// economy.computeDemand, events (gap) and the engine (growth, rep bleed).
export const MANDATES: MandateDef[] = [
  {
    id: 'blitzscale',
    name: 'Blitzscaling',
    desc: 'Growth ×1.5 and events come ~35% more often. The board loves a chart that goes up and to the right — fast.',
    spBonus: 0.4,
  },
  {
    id: 'ironclad',
    name: 'Reliability pledge',
    desc: 'Enterprise trust: +12% revenue — but reputation bleeds ×1.75 when you drop. You promised nines in writing.',
    spBonus: 0.25,
  },
  {
    id: 'shoestring',
    name: 'Shoestring ops',
    desc: '−15% infra cost, but the market cap for this round is 15% smaller. Do more with less, exit early.',
    spBonus: 0.3,
  },
];

export const mandateById = new Map<MandateId, MandateDef>(MANDATES.map((m) => [m.id, m]));

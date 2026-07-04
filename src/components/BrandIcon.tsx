import {
  siApachekafka,
  siCloudflare,
  siDocker,
  siGithubactions,
  siGrafana,
  siKubernetes,
  siNginx,
  siPostgresql,
  siPrometheus,
  siRedis,
  siStripe,
} from 'simple-icons';
import type { NodeKind } from '../game/engine/types';

// Real brand marks via simple-icons (MIT-licensed set; the trademarks belong to
// their owners and are used nominatively — this game is about the real tools).
// AWS marks aren't in the set (removed at Amazon's request), so those services
// get original line-glyphs drawn in AWS's category colors.

interface SiIcon {
  path: string;
  hex: string;
  title: string;
}

const BRAND: Partial<Record<NodeKind, SiIcon>> = {
  nginx: siNginx,
  redis: siRedis,
  postgres: siPostgresql,
  queue: siApachekafka,
  k8s: siKubernetes,
  prometheus: siPrometheus,
  grafana: siGrafana,
  stripe: siStripe,
  app: siDocker,
  cicd: siGithubactions,
  cdn: siCloudflare,
};

// Original glyphs (24×24, stroke-based) for services without a usable mark.
const GLYPH: Partial<Record<NodeKind, { el: React.ReactNode; color: string; title: string }>> = {
  users: {
    title: 'Internet',
    color: '#1a2634',
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.2" />
        <ellipse cx="12" cy="12" rx="3.6" ry="8.2" />
        <path d="M4.2 12h15.6M5.3 7.6h13.4M5.3 16.4h13.4" />
      </g>
    ),
  },
  lb: {
    title: 'Elastic Load Balancer',
    color: '#8C4FFF', // AWS networking purple
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 12h6M9.5 12l8-6.5M9.5 12l8 0M9.5 12l8 6.5" />
        <circle cx="19.3" cy="5.5" r="1.7" fill="currentColor" stroke="none" />
        <circle cx="19.3" cy="12" r="1.7" fill="currentColor" stroke="none" />
        <circle cx="19.3" cy="18.5" r="1.7" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  apigw: {
    title: 'API Gateway',
    color: '#8C4FFF',
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.2l7.5 3.4v5.2c0 4.5-3.1 7.7-7.5 9-4.4-1.3-7.5-4.5-7.5-9V6.6L12 3.2z" />
        <path d="M8.8 12h6.4M12.9 9.5l2.5 2.5-2.5 2.5" />
      </g>
    ),
  },
  s3: {
    title: 'S3 (object storage)',
    color: '#3F8624', // AWS storage green
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <path d="M4.5 5.5c0-1.4 3.4-2.5 7.5-2.5s7.5 1.1 7.5 2.5" />
        <path d="M4.5 5.5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
        <path d="M4.5 5.5l1.8 13.2c.2 1.3 2.7 2.3 5.7 2.3s5.5-1 5.7-2.3l1.8-13.2" />
      </g>
    ),
  },
  lambda: {
    title: 'Lambda (serverless)',
    color: '#ED7100', // AWS compute orange
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4.5h3.4L16 19.5h2.5M12.4 11.8L7.5 19.5H5" />
      </g>
    ),
  },
  replica: {
    title: 'Read replica',
    color: '#7a96e8', // postgres blue, lighter
    el: <path fill="currentColor" d={siPostgresql.path} />,
  },
  worker: {
    title: 'Worker',
    color: '#56687a',
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
        <circle cx="12" cy="12" r="3.6" />
        <path d="M12 4.2v2.6M12 17.2v2.6M4.2 12h2.6M17.2 12h2.6M6.5 6.5l1.9 1.9M15.6 15.6l1.9 1.9M17.5 6.5l-1.9 1.9M8.4 15.6l-1.9 1.9" />
      </g>
    ),
  },
  autoscaler: {
    title: 'Auto Scaling',
    color: '#ED7100',
    el: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1.4" />
        <path d="M12 2.8v3M12 18.2v3M15.2 5.8L12 2.8 8.8 5.8M8.8 18.2l3.2 3 3.2-3" />
      </g>
    ),
  },
};

export function brandColor(kind: NodeKind): string {
  const si = BRAND[kind];
  if (si) return `#${si.hex}`;
  return GLYPH[kind]?.color ?? '#56687a';
}

export default function BrandIcon({ kind, size = 16 }: { kind: NodeKind; size?: number }) {
  if (kind === 'zone') kind = 'app';
  const si = BRAND[kind];
  if (si) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={si.title}>
        <path d={si.path} fill={`#${si.hex}`} />
      </svg>
    );
  }
  const g = GLYPH[kind];
  if (!g) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={g.title} style={{ color: g.color }}>
      {g.el}
    </svg>
  );
}

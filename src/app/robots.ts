import type { MetadataRoute } from 'next';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

// GEO: crawlers de ferramentas de IA explicitamente liberados — sem o allow,
// alguns bots deixam de visitar por padrão (ex: Google-Extended).
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'cohere-ai',
  'meta-externalagent',
  'Amazonbot',
  'Bytespider',
  'Applebot-Extended',
  'YouBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: AI_CRAWLERS, allow: '/' },
    ],
    sitemap: `${AUTOBLOG_PROFILE.brand.siteUrl}/sitemap.xml`,
  };
}

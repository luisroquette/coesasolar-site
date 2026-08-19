import type { MetadataRoute } from 'next';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${AUTOBLOG_PROFILE.brand.siteUrl}/sitemap.xml`,
  };
}

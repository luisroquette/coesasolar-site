/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // O código herdado da Lovable tem centenas de `any` pré-existentes;
    // o lint continua disponível manualmente via `npm run lint`
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Código herdado da Lovable nunca passou por tsc (o Vite não typechecka);
    // `npx tsc --noEmit` continua disponível manualmente
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Suporta imports com sufixo `?raw` (sintaxe Vite) — embute o arquivo como string
    config.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    })
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}
module.exports = nextConfig

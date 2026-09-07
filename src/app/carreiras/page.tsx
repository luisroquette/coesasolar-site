// src/app/carreiras/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeNavbar } from '@/components/home/HomeNavbar';
import { HomeFooter } from '@/components/home/HomeFooter';
import { getVagasPublicadas } from '@/lib/carreiras/supabase';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Carreiras | Coesa Energia',
  description: 'Vagas abertas na Coesa Energia — venha construir o futuro da energia com a gente.',
};

const serif = { fontFamily: 'Georgia, serif' };

const ORDEM_AREAS = [
  'Tech/Dev & AI', 'Vendas', 'Operação', 'Pessoas', 'Jurídico',
  'Marketing e Inovação', 'Sucesso do Cliente', 'Backoffice', 'Financeiro',
];

function agruparPorArea(vagas: Awaited<ReturnType<typeof getVagasPublicadas>>) {
  const porArea = new Map<string, typeof vagas>();
  for (const vaga of vagas) {
    const area = vaga.area && ORDEM_AREAS.includes(vaga.area) ? vaga.area : 'Outras';
    porArea.set(area, [...(porArea.get(area) ?? []), vaga]);
  }
  const ordem = [...ORDEM_AREAS, 'Outras'];
  return ordem.filter((a) => porArea.has(a)).map((area) => ({ area, vagas: porArea.get(area)! }));
}

export default async function CarreirasPage() {
  const vagas = await getVagasPublicadas();

  return (
    <main className="min-h-screen bg-background">
      <HomeNavbar />

      <section className="bg-coesa-green pt-32 pb-20 px-4">
        <div className="container max-w-4xl mx-auto text-center">
          <h1 style={serif} className="text-4xl md:text-6xl font-bold text-white leading-tight">
            Venha construir o futuro da energia com a gente.
          </h1>
        </div>
      </section>

      <section className="container max-w-4xl mx-auto px-4 py-16">
        {vagas.length === 0 ? (
          <p className="text-center text-muted-foreground">
            Nenhuma vaga aberta no momento — deixe seu contato em breve.
          </p>
        ) : (
          <div className="space-y-12">
            {agruparPorArea(vagas).map(({ area, vagas: vagasDaArea }) => (
              <section key={area}>
                <div className="flex items-center gap-4 mb-5">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-coesa-ink whitespace-nowrap">
                    {area}
                  </h2>
                  <div className="h-px flex-1 bg-coesa-line" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vagasDaArea.map((vaga) => (
                    <Link
                      key={vaga.slug}
                      href={`/carreiras/${vaga.slug}`}
                      className="group block border border-coesa-line rounded-lg p-6 hover:border-coesa-ink transition-colors bg-white"
                    >
                      <h3 style={serif} className="text-xl font-semibold text-foreground">
                        {vaga.titulo}
                      </h3>
                      <div className="mt-2 h-px w-12 bg-coesa-ink" />
                      <p className="mt-3 text-xs uppercase tracking-wider text-coesa-text-muted flex flex-wrap items-center gap-2">
                        {[vaga.regime, vaga.modalidade, vaga.local].filter(Boolean).join(' · ')}
                        <span className="text-coesa-ink group-hover:translate-x-1 transition-transform">→</span>
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      <HomeFooter />
    </main>
  );
}

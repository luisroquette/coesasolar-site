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
          <ul className="space-y-6">
            {vagas.map((vaga) => (
              <li key={vaga.slug}>
                <Link
                  href={`/carreiras/${vaga.slug}`}
                  className="group block border border-border rounded-lg p-6 hover:border-coesa-green transition-colors"
                >
                  <h2 style={serif} className="text-2xl font-semibold text-foreground">
                    {vaga.titulo}
                  </h2>
                  <div className="mt-2 h-px w-12 bg-coesa-green" />
                  <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground flex flex-wrap items-center gap-2">
                    {[vaga.area, vaga.regime, vaga.modalidade, vaga.local].filter(Boolean).join(' · ')}
                    <span className="text-coesa-green group-hover:translate-x-1 transition-transform">→</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <HomeFooter />
    </main>
  );
}

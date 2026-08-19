import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getProposalRoutePath } from '@/lib/public-proposal-url';

/**
 * Componente de redirecionamento para URLs antigas (/proposta/:id)
 * Busca o tipo da proposta e redireciona para a rota correta:
 * - /proposta-inicial/:id para propostas iniciais
 * - /proposta-definitiva/:id para propostas definitivas
 */
export default function PropostaPublicaRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('ID da proposta não encontrado');
      return;
    }

    // Validate UUID format before calling edge function
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      setError('Link de proposta inválido');
      return;
    }

    // Buscar tipo da proposta via edge function (público)
    const fetchAndRedirect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('public-proposal', {
          body: { action: 'get', proposalId: id },
        });

        if (error || !data?.proposal) {
          console.error('Proposta não encontrada:', error);
          setError('Proposta não encontrada');
          return;
        }

        // Determinar tipo: se tipo_proposta existe usa ele, senão usa dados_inferidos
        const tipoProposta = data.proposal.tipo_proposta === 'definitiva' 
          ? 'definitiva' 
          : 'inicial';
        
        const routePath = getProposalRoutePath(tipoProposta);
        
        // Preservar query params existentes
        const searchParams = new URLSearchParams(window.location.search);
        const queryString = searchParams.toString();
        const redirectUrl = `/${routePath}/${id}${queryString ? `?${queryString}` : ''}`;
        
        console.log(`[Redirect] /proposta/${id} → ${redirectUrl}`);
        navigate(redirectUrl, { replace: true });
      } catch (err) {
        console.error('Erro ao buscar proposta:', err);
        setError('Erro ao carregar proposta');
      }
    };

    fetchAndRedirect();
  }, [id, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Proposta não encontrada</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">Carregando proposta...</p>
      </div>
    </div>
  );
}

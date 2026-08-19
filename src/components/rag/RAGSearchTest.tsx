import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { 
  Search, 
  Loader2, 
  FileText, 
  Sparkles,
  Clock,
  Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SearchResult {
  id: string;
  content: string;
  file_name: string;
  category: string;
  subcategory?: string;
  source_path?: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  context: string;
  meta: {
    query_length: number;
    results_count: number;
    execution_time_ms: number;
    agent_id: string;
  };
}

const AGENTS = [
  { id: 'sofia', name: 'sofIA', emoji: '👩‍💼' },
  { id: 'maria', name: 'marIA', emoji: '👩‍🔧' },
  { id: 'julia', name: 'julIA', emoji: '👩‍⚖️' },
  { id: 'iago', name: 'Iago', emoji: '🧑‍💻' },
  { id: 'jaime', name: 'Jaime', emoji: '📅' },
];

// Componente para alerta de "near miss"
function NearMissAlert({ query, minSimilarity, agentId }: { query: string; minSimilarity: number; agentId: string }) {
  const [nearMissResults, setNearMissResults] = useState<{ similarity: number; file_name: string }[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const checkNearMiss = async () => {
      if (!query.trim()) return;
      setChecking(true);
      try {
        // Buscar com threshold muito baixo para ver se há resultados próximos
        const { data } = await supabase.functions.invoke('rag-search', {
          body: {
            query: query.trim(),
            agent_id: agentId,
            top_k: 3,
            min_similarity: Math.max(0.1, minSimilarity - 0.15),
          }
        });
        if (data?.results?.length > 0) {
          const nearResults = data.results.filter((r: any) => r.similarity < minSimilarity && r.similarity >= minSimilarity - 0.15);
          if (nearResults.length > 0) {
            setNearMissResults(nearResults.map((r: any) => ({ similarity: r.similarity, file_name: r.file_name })));
          }
        }
      } catch (e) {
        console.error('Near miss check failed:', e);
      } finally {
        setChecking(false);
      }
    };
    checkNearMiss();
  }, [query, minSimilarity, agentId]);

  if (checking) return null;
  if (!nearMissResults || nearMissResults.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-border bg-accent/30 p-3 text-sm">
      <p className="font-medium text-accent-foreground">⚠️ Resultados próximos do limite!</p>
      <p className="text-muted-foreground mt-1">
        Encontramos {nearMissResults.length} resultado(s) com similaridade entre {((minSimilarity - 0.15) * 100).toFixed(0)}% e {(minSimilarity * 100).toFixed(0)}%:
      </p>
      <ul className="mt-1 list-disc list-inside text-muted-foreground">
        {nearMissResults.map((r, i) => (
          <li key={i}>{r.file_name}: {(r.similarity * 100).toFixed(1)}%</li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2">
        💡 Dica: Reduza a similaridade mínima para incluir estes resultados.
      </p>
    </div>
  );
}

export function RAGSearchTest() {
  const { ragDefaultTopK, ragDefaultMinSimilarity } = useUIConfig();
  const [query, setQuery] = useState('');
  const [agentId, setAgentId] = useState('sofia');
  const [topK, setTopK] = useState(ragDefaultTopK);
  // Padrão mais "estrito" para evitar falsos positivos (ex: qualquer consulta voltar os mesmos PDFs).
  const [minSimilarity, setMinSimilarity] = useState(ragDefaultMinSimilarity);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const { toast } = useToast();

  const topSimilarity = response?.results?.length
    ? Math.max(...response.results.map((r) => r.similarity))
    : null;

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: 'Digite uma consulta',
        description: 'É necessário informar o que deseja buscar.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSearching(true);
      setResponse(null);

      const { data, error } = await supabase.functions.invoke('rag-search', {
        body: {
          query: query.trim(),
          agent_id: agentId,
          top_k: topK,
          min_similarity: minSimilarity,
          include_metadata: true,
        }
      });

      if (error) throw error;

      setResponse(data);

      if (data.results?.length === 0) {
        toast({
          title: 'Nenhum resultado encontrado',
          description: 'Dica: se fizer sentido, reduza a similaridade mínima (ex: 20%) para explorar resultados mais fracos.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSearching(false);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.9) return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300';
    if (similarity >= 0.8) return 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300';
    if (similarity >= 0.7) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300';
    return 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Search Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Testar Busca Semântica
          </CardTitle>
          <CardDescription>
            Simule uma busca como se fosse um dos agentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Agent Selection */}
          <div className="space-y-2">
            <Label>Agente</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENTS.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <span className="flex items-center gap-2">
                      <span>{agent.emoji}</span>
                      <span>{agent.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A busca respeitará as permissões do agente selecionado
            </p>
          </div>

          {/* Query Input */}
          <div className="space-y-2">
            <Label>Consulta</Label>
            <Textarea
              placeholder="Ex: Como responder objeção sobre preço alto?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
            />
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Máximo de Resultados: {topK}</Label>
              <Slider
                value={[topK]}
                onValueChange={([v]) => setTopK(v)}
                min={1}
                max={10}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Similaridade Mínima: {(minSimilarity * 100).toFixed(0)}%</Label>
              <Slider
                value={[minSimilarity]}
                onValueChange={([v]) => setMinSimilarity(v)}
                min={0.1}
                max={0.9}
                step={0.05}
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: 40–55% para equilíbrio entre precisão e recall. Padrão: 45%.
              </p>
            </div>
          </div>

          <Button onClick={handleSearch} disabled={searching} className="w-full">
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Buscar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Resultados
            </span>
            {response && (
              <div className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {response.meta.results_count}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {response.meta.execution_time_ms}ms
                </span>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!!response && response.results.length > 0 && topSimilarity !== null && topSimilarity < 0.35 && (
            <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Atenção: resultados de baixa confiança</p>
              <p className="text-muted-foreground">
                A melhor similaridade foi {(topSimilarity * 100).toFixed(1)}%. Isso costuma indicar que a base ainda não tem
                conteúdo realmente relacionado à pergunta — pode parecer que “sempre retorna os mesmos PDFs”.
              </p>
            </div>
          )}
          {!response ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Execute uma busca para ver os resultados</p>
            </div>
          ) : response.results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum resultado encontrado</p>
              <p className="text-sm mt-2">
                Dica: reduza a similaridade mínima para explorar (mas pode trazer resultados irrelevantes)
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {response.results.map((result, index) => (
                <div key={result.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{result.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs capitalize">
                            {result.category}
                          </Badge>
                          {result.subcategory && (
                            <Badge variant="secondary" className="text-xs">
                              {result.subcategory}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${getSimilarityColor(result.similarity)}`}>
                      {(result.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

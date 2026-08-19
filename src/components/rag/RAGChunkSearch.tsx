import { useState } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, FileText, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ChunkResult {
  id: string;
  content: string;
  chunk_index: number;
  file_name: string;
  source_path: string | null;
  category: string;
  document_id: string;
}

export function RAGChunkSearch() {
  const { queryLimitRagChunks } = useUIConfig();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null);
  const [chunkToDelete, setChunkToDelete] = useState<ChunkResult | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: 'Digite um termo de busca',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);
      setSearched(true);

      const { data, error } = await supabase
        .from('rag_chunks')
        .select(`
          id,
          content,
          chunk_index,
          document_id,
          rag_documents!inner (
            file_name,
            source_path,
            category
          )
        `)
        .ilike('content', `%${searchTerm}%`)
        .limit(queryLimitRagChunks);

      if (error) throw error;

      const formattedResults: ChunkResult[] = (data || []).map((row: any) => ({
        id: row.id,
        content: row.content,
        chunk_index: row.chunk_index,
        document_id: row.document_id,
        file_name: row.rag_documents.file_name,
        source_path: row.rag_documents.source_path,
        category: row.rag_documents.category
      }));

      setResults(formattedResults);

      if (formattedResults.length === 0) {
        toast({
          title: 'Nenhum resultado',
          description: `Nenhum chunk contém "${searchTerm}"`
        });
      }
    } catch (error: any) {
      console.error('Error searching chunks:', error);
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChunk = async () => {
    if (!chunkToDelete) return;

    try {
      setDeletingChunkId(chunkToDelete.id);

      const { error } = await supabase
        .from('rag_chunks')
        .delete()
        .eq('id', chunkToDelete.id);

      if (error) throw error;

      // Update document chunk_count directly
      const { data: docData } = await supabase
        .from('rag_documents')
        .select('chunk_count')
        .eq('id', chunkToDelete.document_id)
        .single();

      if (docData) {
        await supabase
          .from('rag_documents')
          .update({ chunk_count: Math.max(0, (docData.chunk_count || 1) - 1) })
          .eq('id', chunkToDelete.document_id);
      }

      // Remove from local state
      setResults(prev => prev.filter(r => r.id !== chunkToDelete.id));

      toast({
        title: 'Chunk excluído',
        description: `Chunk #${chunkToDelete.chunk_index} de "${chunkToDelete.file_name}" foi removido`
      });
    } catch (error: any) {
      console.error('Error deleting chunk:', error);
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setDeletingChunkId(null);
      setChunkToDelete(null);
    }
  };

  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    );
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      vendas: 'bg-blue-500',
      kb_vendas: 'bg-blue-500',
      sac: 'bg-green-500',
      kb_sac: 'bg-green-500',
      cobranca: 'bg-orange-500',
      kb_cobranca: 'bg-orange-500',
      faq: 'bg-purple-500',
      geral: 'bg-gray-500',
    };
    return colors[category] || 'bg-gray-400';
  };

  // Group results by document
  const groupedResults = results.reduce((acc, chunk) => {
    const key = chunk.document_id;
    if (!acc[key]) {
      acc[key] = {
        file_name: chunk.file_name,
        source_path: chunk.source_path,
        category: chunk.category,
        chunks: []
      };
    }
    acc[key].chunks.push(chunk);
    return acc;
  }, {} as Record<string, { file_name: string; source_path: string | null; category: string; chunks: ChunkResult[] }>);

  const documentCount = Object.keys(groupedResults).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Auditoria de Conteúdo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Buscar texto nos chunks (ex: cartório, golpe, preço)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Results Summary */}
        {searched && !loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {results.length > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>
                  Encontrados <strong>{results.length}</strong> chunks em{' '}
                  <strong>{documentCount}</strong> documento(s)
                </span>
              </>
            ) : (
              <span>Nenhum resultado para "{searchTerm}"</span>
            )}
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {Object.entries(groupedResults).map(([docId, doc]) => (
                <Card key={docId} className="border-l-4 border-l-primary">
                  <CardHeader className="py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{doc.file_name}</span>
                      <Badge 
                        variant="secondary" 
                        className={`${getCategoryColor(doc.category)} text-white text-xs`}
                      >
                        {doc.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {doc.chunks.length} match{doc.chunks.length > 1 ? 'es' : ''}
                      </Badge>
                    </div>
                    {doc.source_path && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {doc.source_path}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="py-2 space-y-3">
                    {doc.chunks.map((chunk) => (
                      <div 
                        key={chunk.id} 
                        className="bg-muted/50 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            Chunk #{chunk.chunk_index}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setChunkToDelete(chunk)}
                            disabled={deletingChunkId === chunk.id}
                          >
                            {deletingChunkId === chunk.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            <span className="ml-1 text-xs">Excluir</span>
                          </Button>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {highlightText(
                            chunk.content.length > 500 
                              ? chunk.content.substring(0, 500) + '...' 
                              : chunk.content,
                            searchTerm
                          )}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty State */}
        {!searched && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Busque por termos específicos para auditar o conteúdo da base</p>
            <p className="text-xs mt-1">
              Útil para encontrar informações incorretas ou desatualizadas
            </p>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!chunkToDelete} onOpenChange={() => setChunkToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir chunk?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Você está prestes a excluir o <strong>Chunk #{chunkToDelete?.chunk_index}</strong> do documento:
                </p>
                <p className="font-medium text-foreground">{chunkToDelete?.file_name}</p>
                <p className="text-xs mt-2">
                  ⚠️ Esta ação remove o chunk da base de busca. Para restaurar, será necessário reprocessar o documento original.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteChunk}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir Chunk
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

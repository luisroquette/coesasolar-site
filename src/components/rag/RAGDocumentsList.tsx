import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { 
  FileText, 
  Search, 
  Trash2, 
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RAGDocument {
  id: string;
  file_name: string;
  file_type: string;
  category: string;
  subcategory: string | null;
  source_type: string;
  source_path: string | null;
  chunk_count: number;
  total_tokens: number;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface Props {
  onRefresh: () => void;
}

export function RAGDocumentsList({ onRefresh }: Props) {
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [documentToDelete, setDocumentToDelete] = useState<RAGDocument | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rag_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar documentos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      const { error } = await supabase
        .from('rag_documents')
        .delete()
        .eq('id', documentToDelete.id);

      if (error) throw error;

      toast({
        title: 'Documento excluído',
        description: `${documentToDelete.file_name} foi removido da base de conhecimento.`
      });

      setDocuments(prev => prev.filter(d => d.id !== documentToDelete.id));
      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setDocumentToDelete(null);
    }
  };

  const handleReprocess = async (doc: RAGDocument) => {
    try {
      setReprocessing(doc.id);
      
      const { error } = await supabase.functions.invoke('process-rag-document', {
        body: {
          document_id: doc.id,
          file_name: doc.file_name,
          category: doc.category,
        }
      });

      if (error) throw error;

      toast({
        title: 'Reprocessamento iniciado',
        description: `${doc.file_name} está sendo reprocessado.`
      });

      fetchDocuments();
    } catch (error: any) {
      toast({
        title: 'Erro ao reprocessar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setReprocessing(null);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || doc.processing_status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = [...new Set(documents.map(d => d.category))];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Pronto</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3 animate-spin" /> Processando</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Erro</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      vendas: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      sac: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      cobranca: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      geral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      treinamento: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      regulatorio: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[category] || colors.geral;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos Indexados
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchDocuments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Pronto</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="failed">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-center">Chunks</TableHead>
                <TableHead className="text-center">Tokens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {loading ? 'Carregando...' : 'Nenhum documento encontrado'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocuments.map(doc => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{doc.file_name}</p>
                          {doc.source_path && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {doc.source_path}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getCategoryColor(doc.category)}`}>
                        {doc.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {doc.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{doc.chunk_count}</TableCell>
                    <TableCell className="text-center">{doc.total_tokens.toLocaleString()}</TableCell>
                    <TableCell>
                      {getStatusBadge(doc.processing_status)}
                      {doc.processing_error && (
                        <p className="text-xs text-destructive mt-1 truncate max-w-[150px]" title={doc.processing_error}>
                          {doc.processing_error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.processing_status === 'failed' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleReprocess(doc)}
                            disabled={reprocessing === doc.id}
                          >
                            <RefreshCw className={`h-4 w-4 ${reprocessing === doc.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setDocumentToDelete(doc)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm text-muted-foreground">
          {filteredDocuments.length} de {documents.length} documentos
        </p>
      </CardContent>

      {/* Delete Confirmation */}
      <AlertDialog open={!!documentToDelete} onOpenChange={() => setDocumentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{documentToDelete?.file_name}"? 
              Esta ação irá remover o documento e todos os seus chunks da base de conhecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

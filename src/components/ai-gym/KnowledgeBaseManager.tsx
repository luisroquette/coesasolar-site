import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  BookOpen, 
  Plus, 
  FileText, 
  Link2, 
  Database, 
  MessageSquare,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  Upload,
  FileUp,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface KBSource {
  id: string;
  name: string;
  type: 'document' | 'faq' | 'policy' | 'glossary' | 'api' | 'url' | 'custom';
  description?: string;
  content?: string;
  url?: string;
  lastUpdated?: string;
  enabled: boolean;
}

interface KnowledgeBaseManagerProps {
  sources: KBSource[];
  onChange: (sources: KBSource[]) => void;
  agentName: string;
}

interface UploadProgress {
  fileName: string;
  status: 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
}

const KB_TYPES = [
  { value: 'document', label: 'Documento', icon: FileText, description: 'PDFs, Word, texto' },
  { value: 'faq', label: 'FAQ', icon: MessageSquare, description: 'Perguntas frequentes' },
  { value: 'policy', label: 'Política', icon: BookOpen, description: 'Regras e políticas' },
  { value: 'glossary', label: 'Glossário', icon: BookOpen, description: 'Termos e definições' },
  { value: 'api', label: 'API', icon: Database, description: 'Dados dinâmicos via API' },
  { value: 'url', label: 'URL Externa', icon: Link2, description: 'Conteúdo de website' },
  { value: 'custom', label: 'Personalizado', icon: FileText, description: 'Conteúdo livre' },
];

export function KnowledgeBaseManager({ sources, onChange, agentName }: KnowledgeBaseManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<KBSource | null>(null);
  const [newSource, setNewSource] = useState<Partial<KBSource>>({
    type: 'document',
    enabled: true
  });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Converter array de strings legado para novo formato
  const normalizedSources: KBSource[] = Array.isArray(sources) 
    ? sources.map((source, idx) => {
        if (typeof source === 'string') {
          return {
            id: `kb_${idx}_${Date.now()}`,
            name: source,
            type: 'custom' as const,
            enabled: true
          };
        }
        return source as KBSource;
      })
    : [];

  const handleAddSource = () => {
    if (!newSource.name) return;

    const source: KBSource = {
      id: `kb_${Date.now()}`,
      name: newSource.name,
      type: newSource.type || 'custom',
      description: newSource.description,
      content: newSource.content,
      url: newSource.url,
      lastUpdated: new Date().toISOString(),
      enabled: true
    };

    onChange([...normalizedSources, source]);
    setNewSource({ type: 'document', enabled: true });
    setIsDialogOpen(false);
  };

  const handleUpdateSource = () => {
    if (!editingSource) return;

    const updated = normalizedSources.map(s => 
      s.id === editingSource.id ? { ...editingSource, lastUpdated: new Date().toISOString() } : s
    );
    onChange(updated);
    setEditingSource(null);
  };

  const handleDeleteSource = (id: string) => {
    onChange(normalizedSources.filter(s => s.id !== id));
  };

  const handleToggleSource = (id: string) => {
    const updated = normalizedSources.map(s => 
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    onChange(updated);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast({
        title: 'Nenhum PDF selecionado',
        description: 'Por favor, selecione arquivos PDF.',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(pdfFiles.map(f => ({
      fileName: f.name,
      status: 'uploading',
      progress: 0
    })));

    const newKBs: KBSource[] = [];

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const fileName = file.name.replace('.pdf', '').replace(/[^a-zA-Z0-9_-]/g, '_');
      
      try {
        // Update status to uploading
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'uploading', progress: 30 } : p
        ));

        // Upload to storage
        const filePath = `${agentName.toLowerCase()}/${Date.now()}_${fileName}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('kb-documents')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Update status to processing
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'processing', progress: 60 } : p
        ));

        // Process the document via edge function
        const { data, error: processError } = await supabase.functions.invoke('process-kb-document', {
          body: {
            file_path: filePath,
            file_name: file.name,
            agent_id: agentName.toLowerCase()
          }
        });

        if (processError || !data?.success) {
          throw new Error(data?.error || processError?.message || 'Processing failed');
        }

        // Create KB with extracted content
        const newKB: KBSource = {
          id: `kb_doc_${Date.now()}_${i}`,
          name: fileName,
          type: 'document',
          description: `Conteúdo extraído de ${file.name}`,
          content: data.content,
          url: data.url,
          lastUpdated: new Date().toISOString(),
          enabled: true
        };

        newKBs.push(newKB);

        // Update status to done
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'done', progress: 100 } : p
        ));

      } catch (error: any) {
        console.error(`Error processing ${file.name}:`, error);
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error', progress: 0, error: error.message } : p
        ));
      }
    }

    // Add all successful KBs
    if (newKBs.length > 0) {
      onChange([...normalizedSources, ...newKBs]);
      toast({
        title: 'Upload concluído',
        description: `${newKBs.length} documento(s) processado(s) com sucesso.`
      });
    }

    setIsUploading(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getTypeIcon = (type: string) => {
    const typeConfig = KB_TYPES.find(t => t.value === type);
    return typeConfig?.icon || FileText;
  };

  const getTypeLabel = (type: string) => {
    const typeConfig = KB_TYPES.find(t => t.value === type);
    return typeConfig?.label || 'Personalizado';
  };

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusText = (status: UploadProgress['status']) => {
    switch (status) {
      case 'uploading':
        return 'Enviando...';
      case 'processing':
        return 'Extraindo texto...';
      case 'done':
        return 'Concluído';
      case 'error':
        return 'Erro';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Base de Conhecimento
            </CardTitle>
            <CardDescription>
              Fontes de dados e documentos que {agentName} pode consultar.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {/* Upload em Massa */}
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload PDFs
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileUp className="h-5 w-5" />
                    Upload de Documentos em Massa
                  </DialogTitle>
                  <DialogDescription>
                    Selecione múltiplos arquivos PDF. O conteúdo será extraído automaticamente via IA e transformado em bases de conhecimento.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  {/* File Input */}
                  <div 
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium">Clique para selecionar PDFs</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ou arraste e solte aqui
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Formatos aceitos: PDF (máx. 20MB cada)
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                  />

                  {/* Progress List */}
                  {uploadProgress.length > 0 && (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {uploadProgress.map((file, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium truncate max-w-[200px]">
                                {file.fileName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(file.status)}
                              <span className="text-xs text-muted-foreground">
                                {getStatusText(file.status)}
                              </span>
                            </div>
                          </div>
                          {(file.status === 'uploading' || file.status === 'processing') && (
                            <Progress value={file.progress} className="h-1" />
                          )}
                          {file.error && (
                            <p className="text-xs text-destructive mt-1">{file.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsUploadDialogOpen(false);
                      setUploadProgress([]);
                    }}
                    disabled={isUploading}
                  >
                    {isUploading ? 'Processando...' : 'Fechar'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Novo KB Manual */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo KB
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Adicionar Base de Conhecimento</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova fonte de conhecimento para {agentName}.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome do KB *</Label>
                      <Input
                        value={newSource.name || ''}
                        onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="ex: faq_coesa, politica_planos"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={newSource.type}
                        onValueChange={(value) => setNewSource(prev => ({ ...prev, type: value as KBSource['type'] }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {KB_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <type.icon className="h-4 w-4" />
                                <span>{type.label}</span>
                                <span className="text-xs text-muted-foreground">- {type.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição breve (opcional)</Label>
                    <Input
                      value={newSource.description || ''}
                      onChange={(e) => setNewSource(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Breve descrição do conteúdo para identificação"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>URL / Link do Documento (opcional)</Label>
                    <Input
                      value={newSource.url || ''}
                      onChange={(e) => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://... (link para documento, API ou página web)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Cole aqui o link de um documento, planilha, API ou página web externa.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Conteúdo do KB</Label>
                    <Textarea
                      value={newSource.content || ''}
                      onChange={(e) => setNewSource(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Cole aqui o conteúdo completo do KB: FAQs, políticas, regras, glossário, textos, etc.

Exemplo para FAQ:
P: Como funciona a energia solar por assinatura?
R: Você assina um plano e recebe créditos de energia na sua conta de luz...

Exemplo para Política:
- Desconto máximo permitido: 15%
- Fidelidade mínima: 12 meses
..."
                      rows={12}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Insira o conteúdo completo que o agente deve conhecer. Pode ser texto livre, FAQ, regras, etc.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleAddSource} disabled={!newSource.name}>
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {normalizedSources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma base de conhecimento configurada.</p>
            <p className="text-sm">Clique em "Novo KB" ou "Upload PDFs" para adicionar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {normalizedSources.map((source) => {
              const TypeIcon = getTypeIcon(source.type);
              return (
                <div 
                  key={source.id} 
                  className={`flex items-center justify-between p-4 border rounded-lg transition-opacity ${
                    !source.enabled ? 'opacity-50 bg-muted/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${source.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <TypeIcon className={`h-5 w-5 ${source.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{source.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(source.type)}
                        </Badge>
                        {source.content && (
                          <Badge variant="secondary" className="text-xs">
                            {source.content.length} chars
                          </Badge>
                        )}
                      </div>
                      {source.description && (
                        <p className="text-sm text-muted-foreground">{source.description}</p>
                      )}
                      {source.url && (
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          {source.url.substring(0, 40)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {source.enabled && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setEditingSource(source)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleToggleSource(source.id)}
                    >
                      {source.enabled ? (
                        <span className="text-xs text-muted-foreground">ON</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">OFF</span>
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDeleteSource(source.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingSource} onOpenChange={(open) => !open && setEditingSource(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Base de Conhecimento</DialogTitle>
              <DialogDescription>
                Atualize o conteúdo e configurações deste KB.
              </DialogDescription>
            </DialogHeader>
            {editingSource && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do KB</Label>
                    <Input
                      value={editingSource.name}
                      onChange={(e) => setEditingSource(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={editingSource.type}
                      onValueChange={(value) => setEditingSource(prev => prev ? { ...prev, type: value as KBSource['type'] } : null)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KB_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              <span>{type.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição breve</Label>
                  <Input
                    value={editingSource.description || ''}
                    onChange={(e) => setEditingSource(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="Breve descrição para identificação"
                  />
                </div>

                <div className="space-y-2">
                  <Label>URL / Link do Documento</Label>
                  <Input
                    value={editingSource.url || ''}
                    onChange={(e) => setEditingSource(prev => prev ? { ...prev, url: e.target.value } : null)}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conteúdo do KB</Label>
                  <Textarea
                    value={editingSource.content || ''}
                    onChange={(e) => setEditingSource(prev => prev ? { ...prev, content: e.target.value } : null)}
                    placeholder="Cole aqui o conteúdo completo do KB..."
                    rows={15}
                    className="font-mono text-sm"
                  />
                  {editingSource.content && (
                    <p className="text-xs text-muted-foreground">
                      {editingSource.content.length} caracteres
                    </p>
                  )}
                </div>

                {editingSource.lastUpdated && (
                  <p className="text-xs text-muted-foreground">
                    Última atualização: {new Date(editingSource.lastUpdated).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSource(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateSource}>
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

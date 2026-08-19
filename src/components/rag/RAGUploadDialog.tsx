import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onUploadComplete: () => void;
}

interface UploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
}

const CATEGORIES = [
  { value: 'vendas', label: '🛒 Vendas', description: 'Scripts, objeções, planos' },
  { value: 'sac', label: '🎧 SAC', description: 'FAQ, procedimentos' },
  { value: 'cobranca', label: '💰 Cobrança', description: 'Régua, negociação' },
  { value: 'geral', label: '📚 Geral', description: 'Informações da empresa' },
  { value: 'treinamento', label: '🎓 Treinamento', description: 'Materiais de capacitação' },
  { value: 'regulatorio', label: '⚖️ Regulatório', description: 'ANEEL, legislação' },
];

export function RAGUploadDialog({ onUploadComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newUploads: UploadItem[] = Array.from(files).map(file => ({
      file,
      status: 'pending',
      progress: 0,
    }));

    setUploads(prev => [...prev, ...newUploads]);
  };

  const updateUploadStatus = (index: number, updates: Partial<UploadItem>) => {
    setUploads(prev => prev.map((item, i) => 
      i === index ? { ...item, ...updates } : item
    ));
  };

  const uploadFile = async (item: UploadItem, index: number) => {
    try {
      updateUploadStatus(index, { status: 'uploading', progress: 20 });

      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(item.file);
      const base64Content = await base64Promise;

      updateUploadStatus(index, { progress: 50 });

      // Call upload function
      const { data, error } = await supabase.functions.invoke('rag-upload', {
        body: {
          file_name: item.file.name,
          file_content: base64Content,
          file_type: item.file.type,
          category,
        }
      });

      if (error) throw error;

      updateUploadStatus(index, { status: 'processing', progress: 70 });

      // Wait a bit for processing (it's async)
      await new Promise(resolve => setTimeout(resolve, 1000));

      updateUploadStatus(index, { status: 'done', progress: 100 });

    } catch (error: any) {
      updateUploadStatus(index, { 
        status: 'error', 
        progress: 0,
        error: error.message 
      });
    }
  };

  const handleUpload = async () => {
    if (!category) {
      toast({
        title: 'Selecione uma categoria',
        description: 'É necessário escolher uma categoria para os documentos.',
        variant: 'destructive'
      });
      return;
    }

    if (uploads.length === 0) {
      toast({
        title: 'Selecione arquivos',
        description: 'Adicione pelo menos um arquivo para upload.',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status === 'pending') {
        await uploadFile(uploads[i], i);
      }
    }

    setIsUploading(false);
    
    const successCount = uploads.filter(u => u.status === 'done').length;
    const errorCount = uploads.filter(u => u.status === 'error').length;

    toast({
      title: 'Upload concluído',
      description: `${successCount} arquivo(s) processado(s)${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}`
    });

    if (successCount > 0) {
      onUploadComplete();
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setOpen(false);
      setUploads([]);
      setCategory('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeUpload = (index: number) => {
    if (!isUploading) {
      setUploads(prev => prev.filter((_, i) => i !== index));
    }
  };

  const getStatusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Documento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload de Documentos
          </DialogTitle>
          <DialogDescription>
            Adicione PDFs, DOCXs ou TXTs à base de conhecimento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Category Selection */}
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={setCategory} disabled={isUploading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div className="flex flex-col">
                      <span>{cat.label}</span>
                      <span className="text-xs text-muted-foreground">{cat.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File Input */}
          <div className="space-y-2">
            <Label>Arquivos</Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                file:cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: PDF, DOCX, DOC, TXT, MD
            </p>
          </div>

          {/* Upload List */}
          {uploads.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {uploads.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-2 border rounded-lg">
                  {getStatusIcon(item.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    {item.status === 'uploading' || item.status === 'processing' ? (
                      <Progress value={item.progress} className="h-1 mt-1" />
                    ) : item.error ? (
                      <p className="text-xs text-destructive truncate">{item.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  {!isUploading && item.status !== 'done' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeUpload(index)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={isUploading || uploads.length === 0}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar ({uploads.filter(u => u.status === 'pending').length})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

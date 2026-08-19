import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Folder, 
  FolderOpen,
  FolderPlus,
  FileText, 
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Home,
  ArrowLeft,
  Cloud,
  File,
  Image,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  Play,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OneDriveItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: number;
  mimeType?: string;
  modifiedAt?: string;
  childCount?: number;
  webUrl?: string;
  learningType?: 'success' | 'failure' | 'neutral';
}

interface BreadcrumbItem {
  name: string;
  path: string;
  id?: string;
}

interface LearningFoldersConfig {
  success_folder: string;
  failure_folder: string;
  auto_detect_from_content: boolean;
}

interface Props {
  onSyncFolder?: (folderPath: string, learningType?: 'success' | 'failure' | 'auto') => void;
}

const getFileIcon = (mimeType?: string, name?: string) => {
  if (!mimeType && !name) return <File className="h-4 w-4 text-muted-foreground" />;
  
  const ext = name?.split('.').pop()?.toLowerCase();
  
  if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
    return <Image className="h-4 w-4 text-purple-500" />;
  }
  if (mimeType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  }
  if (mimeType?.includes('presentation') || ['pptx', 'ppt'].includes(ext || '')) {
    return <Presentation className="h-4 w-4 text-orange-500" />;
  }
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  if (mimeType?.includes('word') || ['docx', 'doc'].includes(ext || '')) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return <FileArchive className="h-4 w-4 text-yellow-600" />;
  }
  if (['mp4', 'avi', 'mov', 'mkv'].includes(ext || '')) {
    return <Play className="h-4 w-4 text-pink-500" />;
  }
  
  return <File className="h-4 w-4 text-muted-foreground" />;
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// Caracteres inválidos para nomes de pasta no OneDrive
const INVALID_CHARS = /[\/\\:*?"<>|]/;
const INVALID_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
  'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 
  'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

const validateFolderName = (name: string): { valid: boolean; error?: string } => {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Nome da pasta não pode ser vazio' };
  }

  const trimmedName = name.trim();

  if (INVALID_CHARS.test(trimmedName)) {
    return { valid: false, error: 'Nome contém caracteres inválidos: / \\ : * ? " < > |' };
  }

  if (INVALID_NAMES.includes(trimmedName.toUpperCase())) {
    return { valid: false, error: `"${trimmedName}" é um nome reservado do sistema` };
  }

  if (trimmedName.length > 255) {
    return { valid: false, error: 'Nome da pasta muito longo (máximo 255 caracteres)' };
  }

  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return { valid: false, error: 'Nome não pode começar ou terminar com ponto' };
  }

  return { valid: true };
};

export function RAGOneDriveBrowser({ onSyncFolder }: Props) {
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [rootPath, setRootPath] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [driveId, setDriveId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [learningConfig, setLearningConfig] = useState<LearningFoldersConfig>({
    success_folder: 'Scripts/Sucesso',
    failure_folder: 'Scripts/Fracasso',
    auto_detect_from_content: true
  });
  
  // Estado para criar pasta
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderNameError, setFolderNameError] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Determine learning type based on current path
  const getCurrentLearningType = useCallback((path: string): 'success' | 'failure' | 'auto' => {
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes(learningConfig.success_folder.toLowerCase()) || lowerPath.includes('/sucesso')) {
      return 'success';
    }
    if (lowerPath.includes(learningConfig.failure_folder.toLowerCase()) || lowerPath.includes('/fracasso')) {
      return 'failure';
    }
    return 'auto';
  }, [learningConfig]);

  const currentLearningType = getCurrentLearningType(currentPath);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('rag_onedrive_config')
        .select('drive_id, root_folder_path, is_configured')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setDriveId(data.drive_id);
        setRootPath(data.root_folder_path || '');
        setIsConfigured(data.is_configured || false);
        
        if (data.is_configured && data.drive_id) {
          loadFolder(data.root_folder_path || '');
        }
      }

      // Load learning folders config
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'learning_folders_config')
        .single();

      if (configData?.valor) {
        try {
          setLearningConfig(JSON.parse(configData.valor));
        } catch (e) {
          console.error('Failed to parse learning_folders_config');
        }
      }
    } catch (error: any) {
      console.error('Error loading OneDrive config:', error);
    }
  };

  const loadFolder = useCallback(async (folderPath: string, folderId?: string) => {
    let currentDriveId = driveId;
    
    if (!currentDriveId || !isConfigured) {
      // Try to load config first
      const { data } = await supabase
        .from('rag_onedrive_config')
        .select('drive_id, is_configured')
        .single();
      
      if (!data?.is_configured || !data?.drive_id) {
        toast({
          title: 'OneDrive não configurado',
          description: 'Configure as credenciais do OneDrive primeiro.',
          variant: 'destructive'
        });
        return;
      }
      currentDriveId = data.drive_id;
      setDriveId(data.drive_id);
    }

    try {
      setLoading(true);
      
      const body: any = {
        drive_id: currentDriveId
      };
      if (folderPath) {
        body.folder_path = folderPath;
      }

      const { data, error } = await supabase.functions.invoke('onedrive-list-folder', {
        body
      });

      if (error) throw error;

      // Edge function returns folders and files separately
      const allItems: OneDriveItem[] = [];
      
      // Map folders
      if (data?.folders) {
        data.folders.forEach((item: any) => {
          allItems.push({
            id: item.id,
            name: item.name,
            type: 'folder',
            size: item.size,
            modifiedAt: item.lastModified,
            childCount: item.childCount
          });
        });
      }
      
      // Map files
      if (data?.files) {
        data.files.forEach((item: any) => {
          allItems.push({
            id: item.id,
            name: item.name,
            type: 'file',
            size: item.size,
            modifiedAt: item.lastModified
          });
        });
      }

      // Sort: folders first, then files, both alphabetically
      allItems.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setItems(allItems);
      setCurrentPath(folderPath);
      updateBreadcrumbs(folderPath);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar pasta',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [driveId, isConfigured, toast]);

  const updateBreadcrumbs = (path: string) => {
    if (!path) {
      setBreadcrumbs([{ name: 'Raiz', path: '' }]);
      return;
    }

    const parts = path.split('/').filter(Boolean);
    const crumbs: BreadcrumbItem[] = [{ name: 'Raiz', path: '' }];
    
    let currentBuiltPath = '';
    for (const part of parts) {
      currentBuiltPath += `/${part}`;
      crumbs.push({ name: part, path: currentBuiltPath });
    }

    setBreadcrumbs(crumbs);
  };

  const handleFolderClick = (folder: OneDriveItem) => {
    const newPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
    loadFolder(newPath, folder.id);
  };

  const handleBreadcrumbClick = (crumb: BreadcrumbItem) => {
    loadFolder(crumb.path);
  };

  const handleGoBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    loadFolder(parentPath);
  };

  const handleSyncFolder = () => {
    if (onSyncFolder) {
      onSyncFolder(currentPath, currentLearningType);
    }
  };

  const handleCreateFolder = async () => {
    // Validação client-side
    const validation = validateFolderName(newFolderName);
    if (!validation.valid) {
      setFolderNameError(validation.error || 'Nome inválido');
      return;
    }

    if (!driveId) {
      toast({
        title: 'Erro',
        description: 'OneDrive não configurado',
        variant: 'destructive'
      });
      return;
    }

    setIsCreatingFolder(true);
    setFolderNameError(null);

    try {
      const { data, error } = await supabase.functions.invoke('onedrive-create-folder', {
        body: {
          drive_id: driveId,
          parent_path: currentPath,
          folder_name: newFolderName.trim()
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Pasta criada!',
          description: `"${data.folder.name}" foi criada com sucesso.`
        });
        setIsCreateFolderOpen(false);
        setNewFolderName('');
        // Recarregar listagem
        loadFolder(currentPath);
      } else {
        throw new Error(data?.error || 'Erro ao criar pasta');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Erro ao criar pasta';
      
      // Verificar se é erro de pasta já existente
      if (errorMessage.includes('Já existe') || error.error_code === 'FOLDER_EXISTS') {
        setFolderNameError('Já existe uma pasta com este nome');
      } else {
        toast({
          title: 'Erro ao criar pasta',
          description: errorMessage,
          variant: 'destructive'
        });
      }
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleFolderNameChange = (value: string) => {
    setNewFolderName(value);
    // Limpar erro ao digitar
    if (folderNameError) {
      setFolderNameError(null);
    }
  };

  const openCreateFolderModal = () => {
    setNewFolderName('');
    setFolderNameError(null);
    setIsCreateFolderOpen(true);
  };

  // Get learning type badge for a folder
  const getFolderLearningBadge = (folderName: string, folderPath: string) => {
    const fullPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    const type = getCurrentLearningType(fullPath);
    
    if (type === 'success') {
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          Sucesso
        </Badge>
      );
    }
    if (type === 'failure') {
      return (
        <Badge variant="default" className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
          <XCircle className="h-3 w-3 mr-1" />
          Fracasso
        </Badge>
      );
    }
    return null;
  };

  if (!isConfigured) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">OneDrive não configurado</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Configure as credenciais do Azure AD e o Drive ID para navegar pelos arquivos do OneDrive.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Navegador OneDrive
              {currentLearningType === 'success' && (
                <Badge variant="default" className="bg-green-500 text-white ml-2">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Pasta de Sucesso
                </Badge>
              )}
              {currentLearningType === 'failure' && (
                <Badge variant="default" className="bg-red-500 text-white ml-2">
                  <XCircle className="h-3 w-3 mr-1" />
                  Pasta de Fracasso
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {currentLearningType === 'success' 
                ? 'Scripts serão usados como exemplos POSITIVOS a imitar'
                : currentLearningType === 'failure'
                ? 'Scripts serão usados como exemplos NEGATIVOS a evitar'
                : 'Explore a estrutura de pastas antes de sincronizar'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={openCreateFolderModal}
              disabled={loading}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Nova Pasta
            </Button>
            {onSyncFolder && (
              <Button 
                variant="default" 
                size="sm"
                onClick={handleSyncFolder}
                className={currentLearningType === 'success' 
                  ? 'bg-green-600 hover:bg-green-700'
                  : currentLearningType === 'failure'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-primary hover:bg-primary/90'}
              >
                <Download className="h-4 w-4 mr-2" />
                {currentLearningType === 'success' 
                  ? 'Processar como Sucesso'
                  : currentLearningType === 'failure'
                  ? 'Processar como Fracasso'
                  : 'Processar (Auto-detectar)'}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => loadFolder(currentPath)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Breadcrumbs */}
      <div className="px-4 py-2 bg-muted/30 flex items-center gap-1 flex-wrap">
        {currentPath && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center">
            {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-sm"
              onClick={() => handleBreadcrumbClick(crumb)}
              disabled={index === breadcrumbs.length - 1}
            >
              {index === 0 && <Home className="h-3 w-3 mr-1" />}
              {crumb.name}
            </Button>
          </div>
        ))}
      </div>

      <CardContent className="pt-0">
        <ScrollArea className="h-[400px] mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Folder className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Pasta vazia</p>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors ${
                    item.type === 'folder' ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => item.type === 'folder' && handleFolderClick(item)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.type === 'folder' ? (
                      <Folder className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    ) : (
                      <div className="flex-shrink-0">
                        {getFileIcon(item.mimeType, item.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.type === 'file' && item.modifiedAt && (
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.modifiedAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {item.type === 'folder' && getFolderLearningBadge(item.name, currentPath)}
                    {item.type === 'folder' && item.childCount !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        {item.childCount} {item.childCount === 1 ? 'item' : 'itens'}
                      </Badge>
                    )}
                    {item.type === 'file' && item.size && (
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(item.size)}
                      </span>
                    )}
                    {item.type === 'folder' && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {item.webUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.webUrl, '_blank');
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Summary */}
        {items.length > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {items.filter(i => i.type === 'folder').length} pastas, {items.filter(i => i.type === 'file').length} arquivos
            </span>
            <span>
              Total: {formatFileSize(items.reduce((acc, i) => acc + (i.size || 0), 0))}
            </span>
          </div>
        )}
      </CardContent>

      {/* Modal para criar nova pasta */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              Nova Pasta
            </DialogTitle>
            <DialogDescription>
              {currentPath 
                ? `Criar pasta em: ${currentPath}`
                : 'Criar pasta na raiz do OneDrive'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => handleFolderNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCreatingFolder) {
                    handleCreateFolder();
                  }
                }}
                disabled={isCreatingFolder}
                className={folderNameError ? 'border-destructive' : ''}
              />
              {folderNameError && (
                <p className="text-sm text-destructive">{folderNameError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateFolderOpen(false)}
              disabled={isCreatingFolder}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Criar Pasta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

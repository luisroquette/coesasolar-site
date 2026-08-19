import { useState } from 'react';
import { 
  MessageSquare, 
  Mic, 
  Image as ImageIcon, 
  Folder, 
  FolderOpen, 
  Plus, 
  MoreHorizontal,
  Bot,
  Sparkles,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type AgentCategory = 'all' | 'text' | 'voice' | 'image' | 'multimodal' | string;

interface CategoryItem {
  id: AgentCategory;
  label: string;
  icon: React.ReactNode;
  count?: number;
  isFolder?: boolean;
}

interface CustomFolder {
  id: string;
  name: string;
  count: number;
}

interface AgentCategorySidebarProps {
  selectedCategory: AgentCategory;
  onCategoryChange: (category: AgentCategory) => void;
  categoryCounts: Record<AgentCategory, number>;
  customFolders?: CustomFolder[];
  onCreateFolder?: () => void;
  onRenameFolder?: (folderId: string) => void;
  onDeleteFolder?: (folderId: string) => void;
}

const BUILT_IN_CATEGORIES: CategoryItem[] = [
  { id: 'all', label: 'Todos os Agentes', icon: <Bot className="h-4 w-4" /> },
];

const TYPE_CATEGORIES: CategoryItem[] = [
  { id: 'text', label: 'Texto', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'voice', label: 'Voz', icon: <Mic className="h-4 w-4" /> },
  { id: 'image', label: 'Imagem', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'multimodal', label: 'Multimodal', icon: <Layers className="h-4 w-4" /> },
];

export function AgentCategorySidebar({
  selectedCategory,
  onCategoryChange,
  categoryCounts,
  customFolders = [],
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: AgentCategorySidebarProps) {
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);

  const renderCategoryItem = (category: CategoryItem, isSubItem = false) => {
    const isSelected = selectedCategory === category.id;
    const count = categoryCounts[category.id] || 0;
    
    return (
      <button
        key={category.id}
        onClick={() => onCategoryChange(category.id)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
          isSubItem && "ml-2",
          isSelected 
            ? "bg-primary/10 text-primary font-medium" 
            : "hover:bg-muted text-foreground"
        )}
      >
        <div className="flex items-center gap-2">
          {category.icon}
          <span>{category.label}</span>
        </div>
        {count > 0 && (
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded-full",
            isSelected 
              ? "bg-primary/20 text-primary" 
              : "bg-muted-foreground/10 text-muted-foreground"
          )}>
            {count}
          </span>
        )}
      </button>
    );
  };

  const renderCustomFolder = (folder: CustomFolder) => {
    const isSelected = selectedCategory === folder.id;
    const isHovered = hoveredFolder === folder.id;
    
    return (
      <div
        key={folder.id}
        onMouseEnter={() => setHoveredFolder(folder.id)}
        onMouseLeave={() => setHoveredFolder(null)}
        className="relative"
      >
        <button
          onClick={() => onCategoryChange(folder.id)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
            isSelected 
              ? "bg-primary/10 text-primary font-medium" 
              : "hover:bg-muted text-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            {isSelected ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
            <span>{folder.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {folder.count > 0 && (
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                isSelected 
                  ? "bg-primary/20 text-primary" 
                  : "bg-muted-foreground/10 text-muted-foreground"
              )}>
                {folder.count}
              </span>
            )}
            {isHovered && (onRenameFolder || onDeleteFolder) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRenameFolder && (
                    <DropdownMenuItem onClick={() => onRenameFolder(folder.id)}>
                      Renomear
                    </DropdownMenuItem>
                  )}
                  {onDeleteFolder && (
                    <DropdownMenuItem 
                      onClick={() => onDeleteFolder(folder.id)}
                      className="text-destructive"
                    >
                      Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </button>
      </div>
    );
  };

  return (
    <div className="w-64 border-r bg-card h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-6">
          {/* All Agents */}
          <div className="space-y-1">
            {BUILT_IN_CATEGORIES.map(cat => renderCategoryItem(cat))}
          </div>

          {/* By Type */}
          <div className="space-y-1">
            <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Por Tipo
            </div>
            {TYPE_CATEGORIES.map(cat => renderCategoryItem(cat, true))}
          </div>

          {/* Custom Folders */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pastas
              </span>
              {onCreateFolder && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5"
                  onClick={onCreateFolder}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>
            {customFolders.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground italic">
                Nenhuma pasta criada
              </p>
            ) : (
              customFolders.map(renderCustomFolder)
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

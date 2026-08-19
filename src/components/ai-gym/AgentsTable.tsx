import { useState } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  MoreHorizontal, 
  Edit, 
  Download, 
  Trash2, 
  Play, 
  Pause,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  Layers,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  channels: string[];
  status: string;
  version: string;
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  metrics: any;
  tests: any;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  agent_type?: string;
}

interface AgentsTableProps {
  agents: AIAgent[];
  onEdit: (agent: AIAgent) => void;
  onDownload: (agent: AIAgent) => void;
  onStatusChange: (agent: AIAgent, status: string) => void;
  onDelete: (agent: AIAgent) => void;
  isAdmin: boolean;
  categoryTitle?: string;
}

const getAgentTypeIcon = (agent: AIAgent) => {
  // Determine type based on channels
  const hasVoice = agent.channels?.includes('voice');
  const hasText = agent.channels?.includes('whatsapp') || agent.channels?.includes('web') || agent.channels?.includes('email');
  const hasImage = agent.channels?.includes('image');
  
  if (hasVoice && hasText) {
    return <Layers className="h-4 w-4 text-purple-500" />;
  }
  if (hasVoice) {
    return <Mic className="h-4 w-4 text-blue-500" />;
  }
  if (hasImage) {
    return <ImageIcon className="h-4 w-4 text-green-500" />;
  }
  return <MessageSquare className="h-4 w-4 text-primary" />;
};

const getAgentTypeLabel = (agent: AIAgent) => {
  const hasVoice = agent.channels?.includes('voice');
  const hasText = agent.channels?.includes('whatsapp') || agent.channels?.includes('web') || agent.channels?.includes('email');
  
  if (hasVoice && hasText) return 'Multimodal';
  if (hasVoice) return 'Voz';
  return 'Texto';
};

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
    active: { variant: 'default', label: 'Ativo' },
    testing: { variant: 'secondary', label: 'Em Teste' },
    draft: { variant: 'outline', label: 'Rascunho' },
    paused: { variant: 'destructive', label: 'Pausado' },
  };
  const config = variants[status] || { variant: 'outline', label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
};

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    sales: 'Vendas',
    customer_support: 'SAC',
    collections: 'Cobrança',
    onboarding: 'Onboarding',
    scheduling: 'Agendamento',
  };
  return labels[role] || role;
};

export function AgentsTable({
  agents,
  onEdit,
  onDownload,
  onStatusChange,
  onDelete,
  isAdmin,
  categoryTitle = 'Agentes',
}: AgentsTableProps) {
  const { agentsTableItemsPerPage } = useUIConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [togglingAgents, setTogglingAgents] = useState<Set<string>>(new Set());
  const itemsPerPage = agentsTableItemsPerPage;

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAgents.length / itemsPerPage);
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleToggleAgent = async (agent: AIAgent, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    
    setTogglingAgents(prev => new Set(prev).add(agent.id));
    try {
      await onStatusChange(agent, newStatus);
    } finally {
      setTogglingAgents(prev => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-semibold">{categoryTitle}</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[35%]">Nome do Agente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Ativo</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedAgents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {searchQuery 
                    ? 'Nenhum agente encontrado para a busca.' 
                    : 'Nenhum agente nesta categoria.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedAgents.map((agent) => (
                <TableRow 
                  key={agent.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onEdit(agent)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xl">
                        {agent.avatar_emoji}
                      </div>
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {agent.description}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getAgentTypeIcon(agent)}
                      <span className="text-sm text-muted-foreground">
                        {getAgentTypeLabel(agent)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getRoleLabel(agent.role)}</span>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(agent.status)}
                  </TableCell>
                  <TableCell className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="inline-flex items-center justify-center" onClick={(e) => handleToggleAgent(agent, e)}>
                            {togglingAgents.has(agent.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={agent.status === 'active'}
                                className="data-[state=checked]:bg-green-500"
                              />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{agent.status === 'active' ? 'Clique para pausar' : 'Clique para ativar'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground font-mono">
                      v{agent.version}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(agent); }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(agent); }}>
                          <Download className="h-4 w-4 mr-2" />
                          Download Cérebro
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {agent.status === 'active' ? (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(agent, 'paused'); }}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pausar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(agent, 'active'); }}>
                            <Play className="h-4 w-4 mr-2" />
                            Ativar
                          </DropdownMenuItem>
                        )}
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); onDelete(agent); }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} de {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

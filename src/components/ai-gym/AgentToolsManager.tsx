import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Wrench, 
  Plus, 
  Trash2, 
  GripVertical,
  Zap,
  Calculator,
  FileText,
  Search,
  Phone,
  MapPin,
  MessageSquare,
  Bot
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export interface ToolConfig {
  name: string;
  description?: string;
  required_for?: string[];
  enabled: boolean;
}

interface AgentToolsManagerProps {
  tools: ToolConfig[];
  onChange: (tools: ToolConfig[]) => void;
}

// Ferramentas pré-definidas sugeridas
const SUGGESTED_TOOLS: ToolConfig[] = [
  { 
    name: 'calcular_economia', 
    description: 'Calcula economia mensal/anual com base no consumo e tarifa',
    required_for: ['simulacao', 'proposta'],
    enabled: true 
  },
  { 
    name: 'gerar_proposta', 
    description: 'Gera PDF de proposta comercial para o cliente',
    required_for: ['proposta'],
    enabled: true 
  },
  { 
    name: 'buscar_tarifa', 
    description: 'Consulta tarifa da concessionária por UF/nome',
    required_for: ['simulacao', 'proposta'],
    enabled: true 
  },
  { 
    name: 'consultar_cep', 
    description: 'Busca endereço completo a partir do CEP',
    required_for: ['coleta_dados'],
    enabled: true 
  },
  { 
    name: 'agendar_callback', 
    description: 'Agenda retorno de ligação para o cliente',
    required_for: ['atendimento'],
    enabled: false 
  },
  { 
    name: 'enviar_contrato', 
    description: 'Dispara contrato digital para assinatura',
    required_for: ['fechamento'],
    enabled: false 
  },
  { 
    name: 'consultar_lead', 
    description: 'Busca informações do lead no CRM/Bitrix',
    required_for: ['atendimento', 'followup'],
    enabled: true 
  },
  { 
    name: 'transferir_humano', 
    description: 'Escala conversa para atendente humano',
    required_for: ['escalacao'],
    enabled: true 
  },
];

const TOOL_ICONS: Record<string, React.ReactNode> = {
  calcular_economia: <Calculator className="h-4 w-4" />,
  gerar_proposta: <FileText className="h-4 w-4" />,
  buscar_tarifa: <Search className="h-4 w-4" />,
  consultar_cep: <MapPin className="h-4 w-4" />,
  agendar_callback: <Phone className="h-4 w-4" />,
  enviar_contrato: <FileText className="h-4 w-4" />,
  consultar_lead: <Search className="h-4 w-4" />,
  transferir_humano: <MessageSquare className="h-4 w-4" />,
};

export function AgentToolsManager({ tools, onChange }: AgentToolsManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTool, setNewTool] = useState<ToolConfig>({
    name: '',
    description: '',
    required_for: [],
    enabled: true
  });
  const [requiredForInput, setRequiredForInput] = useState('');

  const handleToggleTool = (index: number) => {
    const updated = [...tools];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    onChange(updated);
  };

  const handleRemoveTool = (index: number) => {
    const updated = tools.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAddTool = () => {
    if (!newTool.name.trim()) return;
    
    const toolToAdd: ToolConfig = {
      ...newTool,
      name: newTool.name.toLowerCase().replace(/\s+/g, '_'),
      required_for: requiredForInput.split(',').map(s => s.trim()).filter(Boolean)
    };
    
    onChange([...tools, toolToAdd]);
    setNewTool({ name: '', description: '', required_for: [], enabled: true });
    setRequiredForInput('');
    setIsAddDialogOpen(false);
  };

  const handleAddSuggested = (suggested: ToolConfig) => {
    // Verifica se já existe
    if (tools.some(t => t.name === suggested.name)) return;
    onChange([...tools, { ...suggested }]);
  };

  const getToolIcon = (name: string) => {
    return TOOL_ICONS[name] || <Wrench className="h-4 w-4" />;
  };

  const availableSuggestions = SUGGESTED_TOOLS.filter(
    s => !tools.some(t => t.name === s.name)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Ferramentas Disponíveis
            </CardTitle>
            <CardDescription>
              Capacidades e integrações que o agente pode utilizar durante as conversas.
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Ferramenta</DialogTitle>
                <DialogDescription>
                  Adicione uma nova capacidade para o agente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Ferramenta</Label>
                  <Input
                    placeholder="ex: consultar_estoque"
                    value={newTool.name}
                    onChange={(e) => setNewTool(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use snake_case sem espaços ou caracteres especiais.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="O que essa ferramenta faz..."
                    value={newTool.description}
                    onChange={(e) => setNewTool(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usada em quais intenções? (separado por vírgula)</Label>
                  <Input
                    placeholder="ex: simulacao, proposta, atendimento"
                    value={requiredForInput}
                    onChange={(e) => setRequiredForInput(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newTool.enabled}
                    onCheckedChange={(checked) => setNewTool(prev => ({ ...prev, enabled: checked }))}
                  />
                  <Label>Ativada por padrão</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddTool} disabled={!newTool.name.trim()}>
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de ferramentas configuradas */}
        {tools.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <Bot className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma ferramenta configurada</p>
            <p className="text-sm">Adicione ferramentas ou escolha das sugestões abaixo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tools.map((tool, idx) => (
              <div 
                key={idx} 
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  tool.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div className={`p-2 rounded-md ${tool.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {getToolIcon(tool.name)}
                  </div>
                  <div>
                    <p className="font-medium font-mono text-sm">{tool.name}</p>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    )}
                    {tool.required_for && tool.required_for.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {tool.required_for.map((intent, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">
                            {intent}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={() => handleToggleTool(idx)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveTool(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sugestões de ferramentas */}
        {availableSuggestions.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Ferramentas Sugeridas
            </p>
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map((suggested) => (
                <Button
                  key={suggested.name}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleAddSuggested(suggested)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {suggested.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { 
  Image, FileText, Mic, Volume2, FileSpreadsheet, Link2, 
  Target, Bell, RotateCcw, AlertTriangle, Loader2, Brain, Crown
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useSofiaCapabilities, SofiaCapabilities } from '@/hooks/useSofiaCapabilities';
import { cn } from '@/lib/utils';

interface CapabilityConfig {
  key: keyof SofiaCapabilities;
  label: string;
  description: string;
  icon: React.ReactNode;
  warning?: string;
  category: 'media' | 'proposals' | 'behavior';
}

const CAPABILITIES_CONFIG: CapabilityConfig[] = [
  // Media Processing
  {
    key: 'leituraImagens',
    label: 'Leitura de Imagens',
    description: 'Analisa fotos e imagens enviadas (contas de energia, documentos)',
    icon: <Image className="h-4 w-4" />,
    category: 'media',
  },
  {
    key: 'leituraPdfs',
    label: 'Leitura de PDFs',
    description: 'Analisa arquivos PDF enviados pelos clientes',
    icon: <FileText className="h-4 w-4" />,
    category: 'media',
  },
  {
    key: 'transcricaoAudio',
    label: 'Transcrição de Áudios',
    description: 'Entende e transcreve mensagens de voz',
    icon: <Mic className="h-4 w-4" />,
    category: 'media',
  },
  {
    key: 'envioAudio',
    label: 'Envio de Áudio',
    description: 'Envia respostas em áudio para os clientes',
    icon: <Volume2 className="h-4 w-4" />,
    warning: 'Temporariamente indisponível - aguardando suporte ChatApp',
    category: 'media',
  },
  // Proposals
  {
    key: 'gerarPropostas',
    label: 'Gerar Propostas',
    description: 'Cria propostas automaticamente quando tem dados suficientes',
    icon: <FileSpreadsheet className="h-4 w-4" />,
    category: 'proposals',
  },
  {
    key: 'enviarLinks',
    label: 'Enviar Links de Proposta',
    description: 'Envia links de propostas automaticamente ao cliente',
    icon: <Link2 className="h-4 w-4" />,
    category: 'proposals',
  },
  // Behavior
  {
    key: 'modoCloser',
    label: 'Modo Closer Premium',
    description: 'Técnicas avançadas de fechamento para leads de alta intenção',
    icon: <Target className="h-4 w-4" />,
    category: 'behavior',
  },
  {
    key: 'followups',
    label: 'Follow-ups Automáticos',
    description: 'Nudges e reengajamento D+1, D+3, D+7',
    icon: <Bell className="h-4 w-4" />,
    category: 'behavior',
  },
  {
    key: 'ofertaMaster',
    label: 'Oferta MASTER',
    description: 'Última cartada: 30% + 4 anos com janela de 12 horas para fechar leads resistentes',
    icon: <Crown className="h-4 w-4" />,
    warning: 'Usar com moderação - é a máxima condição oferecida',
    category: 'behavior',
  },
];

const CATEGORY_LABELS = {
  media: { label: 'Processamento de Mídia', icon: <Image className="h-4 w-4" /> },
  proposals: { label: 'Geração de Propostas', icon: <FileSpreadsheet className="h-4 w-4" /> },
  behavior: { label: 'Comportamento e Engajamento', icon: <Target className="h-4 w-4" /> },
};

export function SofiaCapabilitiesConfig() {
  const { capabilities, loading, updating, updateCapability, resetToDefaults } = useSofiaCapabilities();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    await resetToDefaults();
    setIsResetting(false);
    setShowResetDialog(false);
  };

  const renderCapabilitySwitch = (config: CapabilityConfig) => {
    const isEnabled = capabilities[config.key];
    const isUpdating = updating === config.key;

    return (
      <div 
        key={config.key}
        className={cn(
          "flex items-center justify-between p-4 rounded-lg border transition-all",
          isEnabled ? "bg-background" : "bg-muted/30",
          config.warning && !isEnabled && "border-amber-500/50"
        )}
      >
        <div className="flex items-start gap-3 flex-1">
          <div className={cn(
            "p-2 rounded-lg",
            isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={cn(
                "font-medium",
                !isEnabled && "text-muted-foreground"
              )}>
                {config.label}
              </span>
              {config.warning && !isEnabled && (
                <Badge variant="outline" className="text-amber-600 border-amber-500/50 text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Limitado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {config.description}
            </p>
            {config.warning && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ {config.warning}
              </p>
            )}
          </div>
        </div>
        <div className="ml-4">
          {loading ? (
            <Skeleton className="h-6 w-11" />
          ) : (
            <div className="flex items-center gap-2">
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={isEnabled}
                onCheckedChange={(value) => updateCapability(config.key, value)}
                disabled={isUpdating}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCategory = (category: 'media' | 'proposals' | 'behavior') => {
    const categoryConfig = CATEGORY_LABELS[category];
    const categoryCapabilities = CAPABILITIES_CONFIG.filter(c => c.category === category);

    return (
      <div key={category} className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {categoryConfig.icon}
          {categoryConfig.label}
        </div>
        <div className="space-y-2">
          {categoryCapabilities.map(renderCapabilitySwitch)}
        </div>
      </div>
    );
  };

  // Count enabled capabilities
  const enabledCount = Object.values(capabilities).filter(Boolean).length;
  const totalCount = Object.keys(capabilities).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Capacidades da sofIA</CardTitle>
                <CardDescription>
                  Configure quais funcionalidades estão ativas
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-sm">
              {enabledCount}/{totalCount} ativas
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderCategory('media')}
          {renderCategory('proposals')}
          {renderCategory('behavior')}

          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setShowResetDialog(true)}
              disabled={loading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar Padrões
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar Configurações Padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá reativar todas as capacidades da sofIA para os valores padrão. 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restaurando...
                </>
              ) : (
                'Sim, Restaurar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

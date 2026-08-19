import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Cpu, Zap, Brain, Sparkles, Settings2, Key, Check, ExternalLink, Eye, EyeOff } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface LLMModel {
  id: string;
  name: string;
  description: string;
  speed: 'fast' | 'balanced' | 'powerful';
  provider: 'google' | 'openai' | 'custom';
  recommended?: boolean;
  useCase?: string;
  isNative?: boolean; // Lovable native support (no API key needed)
  // Pricing per 1M tokens (approximate, based on official docs)
  pricingInput?: string;
  pricingOutput?: string;
}

// ALL Lovable AI native models (no API key needed)
// Prices are based on official provider pricing (Lovable charges same as source)
export const LOVABLE_NATIVE_MODELS: LLMModel[] = [
  // Google Gemini Models - Full lineup
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    description: 'Próxima geração, equilibrado velocidade/qualidade',
    speed: 'fast',
    provider: 'google',
    recommended: true,
    useCase: 'Uso geral, conversas',
    isNative: true,
    pricingInput: '$0.10',
    pricingOutput: '$0.40',
  },
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    description: 'Top da linha, raciocínio avançado',
    speed: 'powerful',
    provider: 'google',
    useCase: 'Tarefas críticas, análises complexas',
    isNative: true,
    pricingInput: '$1.25',
    pricingOutput: '$5.00',
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Multimodal, bom raciocínio, menor latência',
    speed: 'balanced',
    provider: 'google',
    useCase: 'Conversas complexas, texto+imagem',
    isNative: true,
    pricingInput: '$0.075',
    pricingOutput: '$0.30',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Ultra rápido, menor custo',
    speed: 'fast',
    provider: 'google',
    useCase: 'Chamadas de voz, alto volume',
    isNative: true,
    pricingInput: '$0.018',
    pricingOutput: '$0.07',
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Contexto grande, imagem+texto, raciocínio forte',
    speed: 'powerful',
    provider: 'google',
    useCase: 'OCR, análises detalhadas',
    isNative: true,
    pricingInput: '$1.25',
    pricingOutput: '$10.00',
  },
  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    description: 'Geração de imagens via texto',
    speed: 'balanced',
    provider: 'google',
    useCase: 'Criação de imagens',
    isNative: true,
    pricingInput: '$0.04',
    pricingOutput: '~$0.04/imagem',
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image Preview',
    description: 'Próxima geração de imagens',
    speed: 'powerful',
    provider: 'google',
    useCase: 'Imagens de alta qualidade',
    isNative: true,
    pricingInput: '$0.08',
    pricingOutput: '~$0.08/imagem',
  },
  // OpenAI GPT Models - Full lineup
  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    description: 'Raciocínio excelente, multimodal',
    speed: 'powerful',
    provider: 'openai',
    useCase: 'Análises detalhadas, precisão',
    isNative: true,
    pricingInput: '$5.00',
    pricingOutput: '$15.00',
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    description: 'Mais recente, melhor reasoning',
    speed: 'powerful',
    provider: 'openai',
    useCase: 'Problemas complexos',
    isNative: true,
    pricingInput: '$5.00',
    pricingOutput: '$15.00',
  },
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Equilíbrio custo/performance',
    speed: 'balanced',
    provider: 'openai',
    useCase: 'Uso geral, bom custo-benefício',
    isNative: true,
    pricingInput: '$0.40',
    pricingOutput: '$1.60',
  },
  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    description: 'Ultra rápido, alto volume',
    speed: 'fast',
    provider: 'openai',
    useCase: 'Respostas rápidas, classificação',
    isNative: true,
    pricingInput: '$0.10',
    pricingOutput: '$0.40',
  },
];

// Custom provider templates (require API key)
// These providers are fully compatible and FUNCTIONAL when configured with valid API keys
export const CUSTOM_PROVIDER_TEMPLATES = [
  { 
    id: 'anthropic', 
    name: 'Anthropic Claude', 
    placeholder: 'sk-ant-...', 
    modelExamples: 'claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-sonnet-20241022',
    pricingHint: '$3-$15/1M input • $15-$75/1M output',
  },
  { 
    id: 'openai-direct', 
    name: 'OpenAI Direct', 
    placeholder: 'sk-...', 
    modelExamples: 'gpt-4.1, gpt-4o, o1-preview, o3-mini',
    pricingHint: '$2-$12/1M input • $8-$50/1M output',
  },
  { 
    id: 'groq', 
    name: 'Groq (Ultra Rápido)', 
    placeholder: 'gsk_...', 
    modelExamples: 'llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it',
    pricingHint: 'Grátis tier disponível • ~$0.05-$0.80/1M tokens',
  },
  { 
    id: 'together', 
    name: 'Together AI', 
    placeholder: '', 
    modelExamples: 'meta-llama/Llama-3.3-70B-Instruct-Turbo, Qwen/QwQ-32B',
    pricingHint: '$0.20-$1.20/1M tokens',
  },
  { 
    id: 'mistral', 
    name: 'Mistral AI', 
    placeholder: '', 
    modelExamples: 'mistral-large-latest, codestral-latest, ministral-8b-latest',
    pricingHint: '$0.10-$3.00/1M tokens',
  },
  { 
    id: 'deepseek', 
    name: 'DeepSeek (Econômico)', 
    placeholder: 'sk-...', 
    modelExamples: 'deepseek-chat, deepseek-reasoner',
    pricingHint: '$0.14-$0.55/1M tokens (muito barato!)',
  },
  { 
    id: 'cohere', 
    name: 'Cohere', 
    placeholder: '', 
    modelExamples: 'command-r-plus, command-r, command-a-03-2025',
    pricingHint: '$0.15-$2.50/1M tokens',
  },
  { 
    id: 'custom', 
    name: 'Outro (Custom)', 
    placeholder: '', 
    modelExamples: 'qualquer modelo compatível com OpenAI API',
    pricingHint: 'Depende do provedor',
  },
];

export interface LLMConfig {
  model: string;
  provider: 'lovable' | 'custom';
  customProvider?: string;
  customApiKey?: string;
  customBaseUrl?: string;
  customModelId?: string;
}

interface LLMModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  customConfig?: {
    provider?: string;
    apiKeyConfigured?: boolean;
    baseUrl?: string;
    modelId?: string;
  };
  onCustomConfigChange?: (config: {
    provider: string;
    baseUrl: string;
    modelId: string;
  }) => void;
  onApiKeyRequest?: (provider: string) => void;
}

function getSpeedIcon(speed: LLMModel['speed']) {
  switch (speed) {
    case 'fast':
      return <Zap className="h-3 w-3" />;
    case 'balanced':
      return <Cpu className="h-3 w-3" />;
    case 'powerful':
      return <Brain className="h-3 w-3" />;
  }
}

function getSpeedBadgeVariant(speed: LLMModel['speed']) {
  switch (speed) {
    case 'fast':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'balanced':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'powerful':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
  }
}

function getProviderColor(provider: LLMModel['provider']) {
  switch (provider) {
    case 'google':
      return 'text-blue-600 dark:text-blue-400';
    case 'openai':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'custom':
      return 'text-orange-600 dark:text-orange-400';
  }
}

function getProviderEmoji(provider: LLMModel['provider']) {
  switch (provider) {
    case 'google':
      return '🔵';
    case 'openai':
      return '🟢';
    case 'custom':
      return '🟠';
  }
}

export function LLMModelSelector({ 
  value, 
  onChange, 
  disabled,
  customConfig,
  onCustomConfigChange,
  onApiKeyRequest,
}: LLMModelSelectorProps) {
  const [showCustom, setShowCustom] = useState(value === 'custom' || value.startsWith('custom:'));
  const [selectedCustomProvider, setSelectedCustomProvider] = useState(customConfig?.provider || '');
  const [customBaseUrl, setCustomBaseUrl] = useState(customConfig?.baseUrl || '');
  const [customModelId, setCustomModelId] = useState(customConfig?.modelId || '');
  const [showApiKeyHint, setShowApiKeyHint] = useState(false);

  const isCustomModel = value === 'custom' || value.startsWith('custom:');
  const selectedNativeModel = LOVABLE_NATIVE_MODELS.find(m => m.id === value);
  const selectedProviderTemplate = CUSTOM_PROVIDER_TEMPLATES.find(p => p.id === selectedCustomProvider);

  const handleNativeModelChange = (modelId: string) => {
    if (modelId === 'custom') {
      setShowCustom(true);
      onChange('custom');
    } else {
      setShowCustom(false);
      onChange(modelId);
    }
  };

  const handleCustomProviderChange = (providerId: string) => {
    setSelectedCustomProvider(providerId);
    
    // Set default base URLs - all are REAL and functional endpoints
    let defaultBaseUrl = '';
    switch (providerId) {
      case 'anthropic':
        defaultBaseUrl = 'https://api.anthropic.com/v1';
        break;
      case 'openai-direct':
        defaultBaseUrl = 'https://api.openai.com/v1';
        break;
      case 'groq':
        defaultBaseUrl = 'https://api.groq.com/openai/v1';
        break;
      case 'together':
        defaultBaseUrl = 'https://api.together.xyz/v1';
        break;
      case 'mistral':
        defaultBaseUrl = 'https://api.mistral.ai/v1';
        break;
      case 'deepseek':
        defaultBaseUrl = 'https://api.deepseek.com/v1';
        break;
      case 'cohere':
        defaultBaseUrl = 'https://api.cohere.ai/v1';
        break;
    }
    
    setCustomBaseUrl(defaultBaseUrl);
    onCustomConfigChange?.({
      provider: providerId,
      baseUrl: defaultBaseUrl,
      modelId: customModelId,
    });
  };

  const handleSaveCustomConfig = () => {
    onCustomConfigChange?.({
      provider: selectedCustomProvider,
      baseUrl: customBaseUrl,
      modelId: customModelId,
    });
    onChange(`custom:${selectedCustomProvider}:${customModelId}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <Label>Modelo de IA (LLM)</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] cursor-help">
                {LOVABLE_NATIVE_MODELS.length} modelos
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Modelos nativos não precisam de API key</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <Select 
        value={isCustomModel ? 'custom' : value} 
        onValueChange={handleNativeModelChange} 
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecione o modelo de IA">
            {selectedNativeModel && (
              <div className="flex items-center gap-2">
                <span className={getProviderColor(selectedNativeModel.provider)}>
                  {getProviderEmoji(selectedNativeModel.provider)}
                </span>
                <span>{selectedNativeModel.name}</span>
                {selectedNativeModel.recommended && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                    Recomendado
                  </Badge>
                )}
              </div>
            )}
            {isCustomModel && (
              <div className="flex items-center gap-2">
                <span className="text-orange-500">🟠</span>
                <span>Modelo Customizado</span>
                {customModelId && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {customModelId}
                  </Badge>
                )}
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          {/* Google Models */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 flex items-center gap-2">
            <span>🔵</span>
            Google Gemini
            <Badge variant="outline" className="text-[9px] ml-auto">Nativo • Sem API Key</Badge>
          </div>
          {LOVABLE_NATIVE_MODELS.filter(m => m.provider === 'google').map(model => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                    {model.recommended && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        ⭐
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{model.description}</span>
                    {model.pricingInput && (
                      <span className="text-[10px] opacity-70">
                        ({model.pricingInput}/{model.pricingOutput} por 1M tokens)
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${getSpeedBadgeVariant(model.speed)}`}>
                  {getSpeedIcon(model.speed)}
                  <span className="ml-1 capitalize">
                    {model.speed === 'fast' ? 'Rápido' : model.speed === 'balanced' ? 'Balanceado' : 'Poderoso'}
                  </span>
                </Badge>
              </div>
            </SelectItem>
          ))}
          
          {/* OpenAI Models */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1 flex items-center gap-2">
            <span>🟢</span>
            OpenAI GPT
            <Badge variant="outline" className="text-[9px] ml-auto">Nativo • Sem API Key</Badge>
          </div>
          {LOVABLE_NATIVE_MODELS.filter(m => m.provider === 'openai').map(model => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{model.description}</span>
                    {model.pricingInput && (
                      <span className="text-[10px] opacity-70">
                        ({model.pricingInput}/{model.pricingOutput} por 1M tokens)
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] ${getSpeedBadgeVariant(model.speed)}`}>
                  {getSpeedIcon(model.speed)}
                  <span className="ml-1 capitalize">
                    {model.speed === 'fast' ? 'Rápido' : model.speed === 'balanced' ? 'Balanceado' : 'Poderoso'}
                  </span>
                </Badge>
              </div>
            </SelectItem>
          ))}

          {/* Custom Model Option */}
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1 flex items-center gap-2">
            <span>🟠</span>
            Integrações Externas
            <Badge variant="outline" className="text-[9px] ml-auto border-amber-500/50 text-amber-600">
              Requer API Key
            </Badge>
          </div>
          <SelectItem value="custom">
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">Configurar Modelo Externo</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Claude, GPT direto, Groq, Mistral, Together, DeepSeek, etc.
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                <Key className="h-3 w-3 mr-1" />
                Custom
              </Badge>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      
      {/* Native model description */}
      {selectedNativeModel && !isCustomModel && (
        <p className="text-xs text-muted-foreground">
          <strong>Uso ideal:</strong> {selectedNativeModel.useCase} — {selectedNativeModel.description}
        </p>
      )}

      {/* Custom Model Configuration */}
      {isCustomModel && (
        <Accordion type="single" collapsible defaultValue="custom-config" className="w-full">
          <AccordionItem value="custom-config" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Configurar Provedor Externo</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-4">
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label>Provedor de IA</Label>
                <Select value={selectedCustomProvider} onValueChange={handleCustomProviderChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o provedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_PROVIDER_TEMPLATES.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCustomProvider && (
                <>
                  {/* API Key Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>API Key</Label>
                      {customConfig?.apiKeyConfigured ? (
                        <Badge variant="outline" className="text-green-600 border-green-500/50">
                          <Check className="h-3 w-3 mr-1" />
                          Configurada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-500/50">
                          Pendente
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onApiKeyRequest?.(selectedCustomProvider)}
                        className="flex-1"
                      >
                        <Key className="h-4 w-4 mr-2" />
                        {customConfig?.apiKeyConfigured ? 'Atualizar API Key' : 'Adicionar API Key'}
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowApiKeyHint(!showApiKeyHint)}
                            >
                              {showApiKeyHint ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {showApiKeyHint ? 'Ocultar dica' : 'Ver dica'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    
                    {showApiKeyHint && selectedProviderTemplate && (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        Formato esperado: <code className="bg-muted px-1 rounded">{selectedProviderTemplate.placeholder || 'sua-api-key'}</code>
                      </p>
                    )}
                  </div>

                  {/* Pricing hint */}
                  {selectedProviderTemplate && 'pricingHint' in selectedProviderTemplate && (
                    <div className="p-3 bg-muted/30 rounded-lg border border-dashed">
                      <p className="text-xs text-muted-foreground">
                        <strong>💰 Preços aproximados:</strong> {(selectedProviderTemplate as any).pricingHint}
                      </p>
                    </div>
                  )}

                  {/* Base URL */}
                  <div className="space-y-2">
                    <Label>Base URL (endpoint)</Label>
                    <Input
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      placeholder="https://api.exemplo.com/v1"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL base da API compatível com OpenAI
                    </p>
                  </div>

                  {/* Model ID */}
                  <div className="space-y-2">
                    <Label>ID do Modelo</Label>
                    <Input
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder={selectedProviderTemplate?.modelExamples?.split(',')[0]?.trim() || 'model-id'}
                    />
                    {selectedProviderTemplate && (
                      <p className="text-xs text-muted-foreground">
                        Exemplos: <code className="bg-muted px-1 rounded">{selectedProviderTemplate.modelExamples}</code>
                      </p>
                    )}
                  </div>

                  {/* Save Button */}
                  <Button 
                    onClick={handleSaveCustomConfig}
                    disabled={!selectedCustomProvider || !customModelId}
                    className="w-full"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Salvar Configuração
                  </Button>

                  {/* Provider Docs Link */}
                  <div className="pt-2 border-t">
                    <a 
                      href={getProviderDocsUrl(selectedCustomProvider)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Documentação do {selectedProviderTemplate?.name}
                    </a>
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function getProviderDocsUrl(providerId: string): string {
  switch (providerId) {
    case 'anthropic':
      return 'https://docs.anthropic.com/en/api/getting-started';
    case 'openai-direct':
      return 'https://platform.openai.com/docs/api-reference';
    case 'groq':
      return 'https://console.groq.com/docs/quickstart';
    case 'together':
      return 'https://docs.together.ai/docs/quickstart';
    case 'mistral':
      return 'https://docs.mistral.ai/api/';
    case 'deepseek':
      return 'https://platform.deepseek.com/api-docs';
    case 'cohere':
      return 'https://docs.cohere.com/reference/about';
    default:
      return 'https://platform.openai.com/docs/api-reference';
  }
}

// Export available models list for use in webhooks
export const AVAILABLE_MODELS = LOVABLE_NATIVE_MODELS;

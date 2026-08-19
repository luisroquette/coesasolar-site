import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, MessageSquare, Users, HelpCircle, ArrowRight, UserCheck, Mail, CreditCard } from 'lucide-react';

export interface IdentificationConfig {
  enabled: boolean;
  // Mensagem solicitando identificação
  message: string;
  // Campos a solicitar
  ask_cpf_cnpj: boolean;
  ask_email: boolean;
  // Mensagem de sucesso após identificação
  success_message: string;
  // Verificação no CRM
  verify_in_crm: boolean;
  // Mensagem quando encontra divergência
  divergence_message: string;
  // Mensagem quando não encontra cadastro
  not_found_message: string;
}

export interface TriageConfig {
  enabled: boolean;
  // Configuração de identificação do cliente
  identification?: IdentificationConfig;
  // Mensagem de confirmação perguntando se é cliente
  confirmation_question: string;
  // Keywords que indicam que SIM, é cliente
  yes_keywords: string[];
  // Keywords que indicam que NÃO é cliente
  no_keywords: string[];
  // Setor de Vendas (para não clientes)
  vendas_contact: string;
  vendas_message: string;
  // Setor SAC (para clientes existentes)
  sac_contact: string;
  sac_message: string;
}

interface AgentTriageConfigProps {
  config: TriageConfig | null;
  onChange: (config: TriageConfig) => void;
}

const DEFAULT_IDENTIFICATION: IdentificationConfig = {
  enabled: true,
  message: "Para eu te ajudar melhor, preciso identificar você no nosso sistema. 📋\n\nPode me informar seu *CPF ou CNPJ* de cadastro e seu *e-mail* de contato?",
  ask_cpf_cnpj: true,
  ask_email: true,
  success_message: "Perfeito! Encontrei seu cadastro aqui. 😊 Como posso te ajudar hoje?",
  verify_in_crm: true,
  divergence_message: "Percebi uma diferença nos dados. No nosso sistema consta:\n\n{campo}: *{valor_crm}*\n\nMas você informou: *{valor_informado}*\n\nQual está correto? O do sistema ou o que você informou?",
  not_found_message: "Não encontrei seu cadastro no sistema com esses dados. 🤔\n\nPode confirmar se o CPF/CNPJ e e-mail estão corretos?"
};

const DEFAULT_CONFIG: TriageConfig = {
  enabled: true,
  identification: DEFAULT_IDENTIFICATION,
  confirmation_question: "Você já é cliente aqui da empresa? Assim posso te direcionar pro setor certo! 😊",
  yes_keywords: ["sim", "sou", "já sou", "sou cliente", "já sou cliente", "sou sim"],
  no_keywords: ["não", "nao", "ainda não", "não sou", "nao sou", "nunca fui"],
  vendas_contact: "",
  vendas_message: "Vou te passar pro nosso time de Vendas que vai te atender super bem! 🚀\n\nÉ só chamar aqui: {contato}",
  sac_contact: "",
  sac_message: "Vou te passar pro nosso SAC que vai resolver isso pra você! 💪\n\nÉ só chamar aqui: {contato}"
};

export function AgentTriageConfig({ config, onChange }: AgentTriageConfigProps) {
  // Merge with defaults
  const currentConfig: TriageConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    identification: {
      ...DEFAULT_IDENTIFICATION,
      ...config?.identification
    }
  };

  const updateConfig = (updates: Partial<TriageConfig>) => {
    onChange({ ...currentConfig, ...updates });
  };

  const updateIdentification = (updates: Partial<IdentificationConfig>) => {
    onChange({
      ...currentConfig,
      identification: {
        ...currentConfig.identification!,
        ...updates
      }
    });
  };

  const handleKeywordsChange = (field: 'yes_keywords' | 'no_keywords', value: string) => {
    const keywords = value.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    updateConfig({ [field]: keywords });
  };

  return (
    <div className="space-y-6">
      {/* Header com toggle */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ArrowRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Triagem Automática</h3>
            <p className="text-sm text-muted-foreground">
              Redireciona clientes para Vendas ou SAC conforme perfil
            </p>
          </div>
        </div>
        <Switch
          checked={currentConfig.enabled}
          onCheckedChange={(enabled) => updateConfig({ enabled })}
        />
      </div>

      {currentConfig.enabled && (
        <>
          {/* Identificação do Cliente */}
          <Card className="border-purple-200 bg-purple-50/30 dark:bg-purple-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <UserCheck className="h-4 w-4" />
                  Identificação do Cliente
                </CardTitle>
                <Switch
                  checked={currentConfig.identification?.enabled ?? true}
                  onCheckedChange={(enabled) => updateIdentification({ enabled })}
                />
              </div>
              <CardDescription>
                Solicita dados de identificação no início do atendimento
              </CardDescription>
            </CardHeader>
            {currentConfig.identification?.enabled && (
              <CardContent className="space-y-4">
                {/* Mensagem de identificação */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs">
                    <MessageSquare className="h-3 w-3" />
                    Mensagem de Solicitação
                  </Label>
                  <Textarea
                    value={currentConfig.identification.message}
                    onChange={(e) => updateIdentification({ message: e.target.value })}
                    placeholder="Para eu te ajudar, preciso identificar você..."
                    className="min-h-[80px] text-sm"
                  />
                </div>

                {/* Campos a solicitar */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Campos a Solicitar:</Label>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ask_cpf_cnpj"
                        checked={currentConfig.identification.ask_cpf_cnpj}
                        onCheckedChange={(checked) => updateIdentification({ ask_cpf_cnpj: !!checked })}
                      />
                      <Label htmlFor="ask_cpf_cnpj" className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <CreditCard className="h-3.5 w-3.5" />
                        CPF / CNPJ
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ask_email"
                        checked={currentConfig.identification.ask_email}
                        onCheckedChange={(checked) => updateIdentification({ ask_email: !!checked })}
                      />
                      <Label htmlFor="ask_email" className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Mail className="h-3.5 w-3.5" />
                        E-mail
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Mensagem de sucesso */}
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem após identificação</Label>
                  <Input
                    value={currentConfig.identification.success_message}
                    onChange={(e) => updateIdentification({ success_message: e.target.value })}
                    placeholder="Perfeito! Encontrei seu cadastro..."
                  />
                </div>

                {/* Verificação no CRM */}
                <div className="pt-3 border-t space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Verificar no CRM Bitrix24</Label>
                      <p className="text-xs text-muted-foreground">
                        Busca e valida dados do cliente no CRM
                      </p>
                    </div>
                    <Switch
                      checked={currentConfig.identification.verify_in_crm ?? true}
                      onCheckedChange={(checked) => updateIdentification({ verify_in_crm: checked })}
                    />
                  </div>

                  {currentConfig.identification.verify_in_crm !== false && (
                    <>
                      {/* Mensagem de divergência */}
                      <div className="space-y-2">
                        <Label className="text-xs">Mensagem ao detectar divergência</Label>
                        <Textarea
                          value={currentConfig.identification.divergence_message}
                          onChange={(e) => updateIdentification({ divergence_message: e.target.value })}
                          placeholder="Percebi uma diferença nos dados..."
                          className="min-h-[80px] text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use <code className="bg-muted px-1 rounded">{'{campo}'}</code>, <code className="bg-muted px-1 rounded">{'{valor_crm}'}</code> e <code className="bg-muted px-1 rounded">{'{valor_informado}'}</code>
                        </p>
                      </div>

                      {/* Mensagem quando não encontra */}
                      <div className="space-y-2">
                        <Label className="text-xs">Mensagem quando não encontra cadastro</Label>
                        <Input
                          value={currentConfig.identification.not_found_message}
                          onChange={(e) => updateIdentification({ not_found_message: e.target.value })}
                          placeholder="Não encontrei seu cadastro..."
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Fluxo Visual */}
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                Fluxo de Redirecionamento
              </CardTitle>
              <CardDescription>
                Quando o cliente pergunta algo fora do escopo deste agente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                  1. Detecta assunto fora do escopo
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200">
                  2. Pergunta: "Você já é cliente?"
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">
                  3. Redireciona pro setor certo
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Pergunta de Confirmação */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Pergunta de Confirmação
            </Label>
            <Textarea
              value={currentConfig.confirmation_question}
              onChange={(e) => updateConfig({ confirmation_question: e.target.value })}
              placeholder="Você já é cliente aqui da empresa?"
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Mensagem enviada para identificar se o lead já é cliente ou não
            </p>
          </div>

          {/* Keywords de Resposta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-green-700">Keywords "Sou Cliente" → SAC</Label>
              <Input
                value={currentConfig.yes_keywords.join(', ')}
                onChange={(e) => handleKeywordsChange('yes_keywords', e.target.value)}
                placeholder="sim, sou, já sou cliente..."
              />
              <p className="text-xs text-muted-foreground">
                Separadas por vírgula. Ex: sim, sou, já sou
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-700">Keywords "Não Sou Cliente" → Vendas</Label>
              <Input
                value={currentConfig.no_keywords.join(', ')}
                onChange={(e) => handleKeywordsChange('no_keywords', e.target.value)}
                placeholder="não, ainda não, nunca fui..."
              />
              <p className="text-xs text-muted-foreground">
                Separadas por vírgula. Ex: não, ainda não
              </p>
            </div>
          </div>

          {/* Setores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vendas */}
            <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <Users className="h-4 w-4" />
                  Setor: Vendas
                </CardTitle>
                <CardDescription>
                  Para leads que ainda NÃO são clientes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3" />
                    WhatsApp do Setor
                  </Label>
                  <Input
                    value={currentConfig.vendas_contact}
                    onChange={(e) => updateConfig({ vendas_contact: e.target.value })}
                    placeholder="5511999999999"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem de Redirecionamento</Label>
                  <Textarea
                    value={currentConfig.vendas_message}
                    onChange={(e) => updateConfig({ vendas_message: e.target.value })}
                    placeholder="Vou te passar pro time de Vendas..."
                    className="min-h-[80px] text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">{'{contato}'}</code> para inserir o número
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* SAC */}
            <Card className="border-green-200 bg-green-50/30 dark:bg-green-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
                  <Users className="h-4 w-4" />
                  Setor: SAC
                </CardTitle>
                <CardDescription>
                  Para clientes que JÁ são da empresa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3" />
                    WhatsApp do Setor
                  </Label>
                  <Input
                    value={currentConfig.sac_contact}
                    onChange={(e) => updateConfig({ sac_contact: e.target.value })}
                    placeholder="5511888888888"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem de Redirecionamento</Label>
                  <Textarea
                    value={currentConfig.sac_message}
                    onChange={(e) => updateConfig({ sac_message: e.target.value })}
                    placeholder="Vou te passar pro SAC..."
                    className="min-h-[80px] text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">{'{contato}'}</code> para inserir o número
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default AgentTriageConfig;

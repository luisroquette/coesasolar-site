import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Zap, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Definição dos campos disponíveis para configuração
const AVAILABLE_FIELDS = [
  { id: 'nome', label: 'Nome do Cliente', description: 'Nome ou Título do lead' },
  { id: 'whatsappOuEmail', label: 'WhatsApp ou E-mail', description: 'Pelo menos um contato é necessário' },
  { id: 'concessionaria', label: 'Concessionária', description: 'Distribuidora de energia (ex: CEMIG, CPFL)' },
  { id: 'valorConta', label: 'Valor da Conta de Luz', description: 'Valor em R$ para cálculo reverso do consumo' },
  { id: 'tipoInstalacao', label: 'Tipo de Instalação', description: 'Monofásico, Bifásico ou Trifásico' },
  { id: 'consumoMedio', label: 'Consumo Médio (kWh)', description: 'Consumo médio mensal em kWh' },
  { id: 'cpfCnpj', label: 'CPF/CNPJ', description: 'Documento do titular' },
  { id: 'endereco', label: 'Endereço Completo', description: 'Endereço da instalação ou titular' },
  { id: 'numeroInstalacao', label: 'Número da Instalação', description: 'Código da UC na fatura' },
];

// Definição dos arquivos/documentos disponíveis
const AVAILABLE_FILES = [
  { id: 'fatura', label: 'Fatura de Energia', description: 'Conta de luz do cliente' },
  { id: 'documento_identidade', label: 'Documento de Identidade', description: 'RG ou CNH do titular' },
  { id: 'contrato_social', label: 'Contrato Social', description: 'Apenas para Pessoa Jurídica (PJ)' },
];

interface AutomationFieldsConfigProps {
  tipo: 'inicial' | 'definitiva';
  onFieldsChange?: () => void;
}

export function AutomationFieldsConfig({ tipo, onFieldsChange }: AutomationFieldsConfigProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const configKeyFields = tipo === 'inicial' 
    ? 'automation_required_fields_inicial' 
    : 'automation_required_fields_definitiva';

  const configKeyFiles = tipo === 'inicial' 
    ? 'automation_required_files_inicial' 
    : 'automation_required_files_definitiva';

  // Campos padrão se não houver configuração salva
  const defaultFields = tipo === 'inicial'
    ? ['nome', 'whatsappOuEmail', 'concessionaria', 'valorConta']
    : ['nome', 'whatsappOuEmail', 'concessionaria', 'cpfCnpj', 'endereco', 'tipoInstalacao'];

  // Arquivos padrão se não houver configuração salva
  const defaultFiles = tipo === 'inicial'
    ? [] // Proposta inicial não exige documentos
    : ['fatura', 'documento_identidade']; // Proposta definitiva exige fatura e documento

  useEffect(() => {
    loadConfig();
  }, [tipo]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      // Carregar configuração de campos
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', configKeyFields)
        .maybeSingle();

      if (fieldsError) throw fieldsError;

      if (fieldsData?.valor) {
        try {
          const parsed = JSON.parse(fieldsData.valor);
          if (Array.isArray(parsed)) {
            setSelectedFields(parsed);
          } else {
            setSelectedFields(defaultFields);
          }
        } catch {
          setSelectedFields(defaultFields);
        }
      } else {
        setSelectedFields(defaultFields);
      }

      // Carregar configuração de arquivos
      const { data: filesData, error: filesError } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', configKeyFiles)
        .maybeSingle();

      if (filesError) throw filesError;

      if (filesData?.valor) {
        try {
          const parsed = JSON.parse(filesData.valor);
          if (Array.isArray(parsed)) {
            setSelectedFiles(parsed);
          } else {
            setSelectedFiles(defaultFiles);
          }
        } catch {
          setSelectedFiles(defaultFiles);
        }
      } else {
        setSelectedFiles(defaultFiles);
      }
    } catch (error) {
      console.error('Erro ao carregar configuração de campos:', error);
      setSelectedFields(defaultFields);
      setSelectedFiles(defaultFiles);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleField = (fieldId: string) => {
    setSelectedFields(prev => {
      if (prev.includes(fieldId)) {
        return prev.filter(f => f !== fieldId);
      } else {
        return [...prev, fieldId];
      }
    });
  };

  const handleToggleFile = (fileId: string) => {
    setSelectedFiles(prev => {
      if (prev.includes(fileId)) {
        return prev.filter(f => f !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  const handleSave = async () => {
    if (selectedFields.length === 0) {
      toast.error('Selecione pelo menos um campo obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Salvar campos
      const { error: fieldsError } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: configKeyFields,
          valor: JSON.stringify(selectedFields),
          descricao: `Campos obrigatórios para proposta ${tipo}`,
        }, { onConflict: 'chave' });

      if (fieldsError) throw fieldsError;

      // Salvar arquivos
      const { error: filesError } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: configKeyFiles,
          valor: JSON.stringify(selectedFiles),
          descricao: `Arquivos obrigatórios para proposta ${tipo}`,
        }, { onConflict: 'chave' });

      if (filesError) throw filesError;

      toast.success(`Configuração de automação para proposta ${tipo} salva!`);
      onFieldsChange?.();
    } catch (error: any) {
      console.error('Erro ao salvar configuração:', error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setSelectedFields(defaultFields);
    setSelectedFiles(defaultFiles);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Requisitos de Automação - Proposta {tipo === 'inicial' ? 'Inicial' : 'Definitiva'}
        </CardTitle>
        <CardDescription>
          {tipo === 'inicial' 
            ? 'Configure os campos e documentos necessários para gerar uma proposta inicial (estimada).'
            : 'Configure os campos e documentos necessários para gerar uma proposta definitiva (completa).'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="fields" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <Zap className="h-3 w-3" />
              Campos ({selectedFields.length})
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <FileText className="h-3 w-3" />
              Documentos ({selectedFiles.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="fields" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {AVAILABLE_FIELDS.map(field => (
                <div
                  key={field.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                    selectedFields.includes(field.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border'
                  }`}
                  onClick={() => handleToggleField(field.id)}
                >
                  <Checkbox
                    id={`${tipo}-field-${field.id}`}
                    checked={selectedFields.includes(field.id)}
                    onCheckedChange={() => handleToggleField(field.id)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label
                      htmlFor={`${tipo}-field-${field.id}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {field.label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {field.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="files" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {AVAILABLE_FILES.map(file => (
                <div
                  key={file.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                    selectedFiles.includes(file.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border'
                  }`}
                  onClick={() => handleToggleFile(file.id)}
                >
                  <Checkbox
                    id={`${tipo}-file-${file.id}`}
                    checked={selectedFiles.includes(file.id)}
                    onCheckedChange={() => handleToggleFile(file.id)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label
                      htmlFor={`${tipo}-file-${file.id}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {file.label}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {file.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {tipo === 'definitiva' && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
                <strong>Nota:</strong> O Contrato Social é obrigatório apenas para clientes PJ (com CNPJ). 
                Ele será automaticamente ignorado para clientes PF.
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{selectedFields.length}</span> campos + 
            <span className="font-medium text-foreground"> {selectedFiles.length}</span> documentos
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetToDefault}
            >
              Restaurar Padrão
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <>Salvar Configuração</>
              )}
            </Button>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <strong>Dica:</strong> Leads que não tiverem todos os campos e documentos obrigatórios preenchidos 
          não terão a proposta gerada automaticamente e serão marcados como "ERRO" no CRM.
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Upload, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatCpfCnpj, isValidCpfCnpj } from '@/lib/cpf-cnpj-utils';
import { formatCEP, isCEPComplete, fetchAddressByCEP } from '@/lib/cep-utils';
import { useDropzone } from 'react-dropzone';

interface CadastroFormProps {
  isOpen: boolean;
  onClose: () => void;
  propostaId: string;
  clienteNome: string;
  planoLabel: string;
  descontoPercentual: number;
  fidelidadeAnos: number;
  onSuccess: () => void;
}

export function CadastroForm({
  isOpen,
  onClose,
  propostaId,
  clienteNome,
  planoLabel,
  descontoPercentual,
  fidelidadeAnos,
  onSuccess,
}: CadastroFormProps) {
  const [nome, setNome] = useState(clienteNome || '');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [numeroInstalacao, setNumeroInstalacao] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [faturaFile, setFaturaFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const onDrop = useCallback((files: File[]) => {
    if (files.length > 0) setFaturaFile(files[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'application/pdf': [] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const handleCepChange = async (value: string) => {
    const formatted = formatCEP(value);
    setCep(formatted);
    if (isCEPComplete(formatted)) {
      setCepLoading(true);
      try {
        const address = await fetchAddressByCEP(formatted);
        if (address) {
          if (address.logradouro) setEndereco(address.logradouro);
          if (address.localidade) setCidade(address.localidade);
          if (address.uf) setUf(address.uf);
        }
      } catch {}
      setCepLoading(false);
    }
  };

  const isFormValid = () => {
    return (
      nome.trim().length > 2 &&
      isValidCpfCnpj(cpfCnpj) &&
      email.includes('@') &&
      telefone.length >= 10 &&
      numeroInstalacao.trim().length > 0 &&
      endereco.trim().length > 0 &&
      faturaFile !== null
    );
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSubmitting(true);

    try {
      // Upload fatura
      let faturaUrl = '';
      if (faturaFile) {
        const filePath = `solicitacoes/${propostaId}/fatura_${Date.now()}_${faturaFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documentos-clientes')
          .upload(filePath, faturaFile);
        if (uploadError) throw uploadError;
        faturaUrl = filePath;
      }

      // Accept proposal + save registration data
      const { data: result, error } = await supabase.functions.invoke('public-proposal', {
        body: {
          action: 'update_status',
          proposalId: propostaId,
          status: 'aceita',
        },
      });
      if (error) throw error;

      // Update proposal with registration data
      await supabase.functions.invoke('bitrix24-update-lead', {
        body: {
          propostaId,
          dados: {
            nome_retificado: nome,
            cpf_cnpj: cpfCnpj,
            email,
            telefone,
            numero_instalacao: numeroInstalacao,
            endereco,
            cidade,
            uf,
            cep,
            conta_energia_url: faturaUrl,
          },
        },
      });

      // Sync with Bitrix24
      try {
        await supabase.functions.invoke('bitrix24-sync', {
          body: { action: 'update_status', proposalId: propostaId, status: 'aceita' },
        });
      } catch {}

      toast.success('Dados enviados com sucesso! Em breve você receberá o contrato.');
      onSuccess();
    } catch (err) {
      console.error('Error submitting registration:', err);
      toast.error('Erro ao enviar dados. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 top-0 sm:top-auto sm:max-h-[90vh] z-[101] overflow-y-auto bg-white sm:rounded-t-3xl shadow-2xl"
          >
            <div className="max-w-lg mx-auto px-5 py-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900">Formulário de Cadastro</h2>
                  <p className="text-sm text-gray-500">Falta pouco para garantir seu desconto!</p>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700">Nome completo *</Label>
                  <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" className="mt-1" />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">CPF ou CNPJ *</Label>
                  <Input
                    value={cpfCnpj}
                    onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">E-mail *</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" type="email" className="mt-1" />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">WhatsApp * (com DDD)</Label>
                  <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(31) 99999-9999" className="mt-1" />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">Número da instalação (UC) *</Label>
                  <Input value={numeroInstalacao} onChange={e => setNumeroInstalacao(e.target.value)} placeholder="Consta na sua fatura CEMIG" className="mt-1" />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">CEP</Label>
                  <Input
                    value={cep}
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">Endereço da unidade consumidora *</Label>
                  <Input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro" className="mt-1" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">Cidade</Label>
                    <Input value={cidade} onChange={e => setCidade(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700">UF</Label>
                    <Input value={uf} onChange={e => setUf(e.target.value)} maxLength={2} className="mt-1" />
                  </div>
                </div>

                {/* Upload */}
                <div>
                  <Label className="text-sm font-semibold text-gray-700">📎 Upload da última fatura de energia *</Label>
                  <div
                    {...getRootProps()}
                    className={`mt-1 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                      isDragActive ? 'border-orange-400 bg-orange-50' : faturaFile ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input {...getInputProps()} />
                    {faturaFile ? (
                      <p className="text-sm text-green-600 font-medium">✓ {faturaFile.name}</p>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="w-6 h-6 text-gray-400" />
                        <p className="text-sm text-gray-500">Clique para anexar ou arraste o arquivo</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Plan summary */}
              <div className="bg-orange-50 rounded-xl p-3 mt-5 text-center">
                <p className="text-sm text-orange-700 font-medium">
                  Plano selecionado: <strong>{planoLabel}</strong> · {descontoPercentual}% · {fidelidadeAnos} anos
                </p>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid() || submitting}
                className="w-full mt-4 h-14 text-base font-bold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    Enviar dados e garantir meu desconto
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>

              <div className="flex items-center gap-2 justify-center mt-3 text-xs text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Seus dados são protegidos e usados apenas para gerar seu contrato. Conforme a LGPD.
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

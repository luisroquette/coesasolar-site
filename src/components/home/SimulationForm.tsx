import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ThankYouModal } from "./ThankYouModal";

const formSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  telefone: z.string().min(10, "Telefone inválido"),
  email: z.string().email("E-mail inválido"),
  valorConta: z.string().min(1, "Informe o valor da conta"),
  concessionaria: z.string().min(1, "Selecione a concessionária"),
});

type FormData = z.infer<typeof formSchema>;

interface Concessionaria {
  id: string;
  nome: string;
}

// Concessionárias atendidas pela COESA (sincronizado com distribuidoras_config)
const CONCESSIONARIAS_ATENDIDAS = [
  'CEMIG',
  'CEMIG-D',
  'ENERGISA MG',
  'ENERGISA',
];

function isConcessionariaAtendida(nome: string): boolean {
  const nomeUpper = nome.toUpperCase().trim();
  return CONCESSIONARIAS_ATENDIDAS.some(c => 
    nomeUpper.includes(c) || c.includes(nomeUpper)
  );
}

export function SimulationForm() {
  const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [isRegionNotSupported, setIsRegionNotSupported] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const concessionariaValue = watch("concessionaria");

  useEffect(() => {
    async function fetchConcessionarias() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("concessionarias")
        .select("id, nome")
        .order("nome");

      if (!error && data) {
        setConcessionarias(data);
      }
      setIsLoading(false);
    }

    fetchConcessionarias();
  }, []);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const formatCurrency = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    const number = parseInt(digits) / 100;
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      // Call edge function to create lead in Bitrix24
      const { data: result, error } = await supabase.functions.invoke('create-lead-from-site', {
        body: {
          nome: data.nome,
          telefone: data.telefone,
          email: data.email,
          valorConta: data.valorConta,
          concessionaria: data.concessionaria,
        },
      });

      if (error) {
        console.error('Error creating lead:', error);
        toast.error('Erro ao enviar simulação. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      if (!result?.success) {
        console.error('Lead creation failed:', result);
        toast.error(result?.error || 'Erro ao processar simulação');
        setIsSubmitting(false);
        return;
      }

      // Check if the concessionária is supported
      const regionNotSupported = !isConcessionariaAtendida(data.concessionaria);
      setIsRegionNotSupported(regionNotSupported);

      // Success! Show thank you modal
      setSubmittedName(data.nome);
      setShowThankYou(true);
      
      // Reset form
      setValue("nome", "");
      setValue("telefone", "");
      setValue("email", "");
      setValue("valorConta", "");
      setValue("concessionaria", "");
      
    } catch (err) {
      console.error('Submit error:', err);
      toast.error('Erro de conexão. Verifique sua internet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="bg-black text-white p-8 lg:p-10"
    >
      <div className="mb-8">
        <h3 
          className="text-2xl lg:text-3xl font-medium mb-3"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          Simule sua economia
        </h3>
        <p className="text-white/60 text-sm">
          Descubra quanto você pode economizar
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="nome" className="text-white/80 text-sm">Nome completo</Label>
          <Input
            id="nome"
            placeholder="Seu nome"
            {...register("nome")}
            className={`bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white rounded-sm h-12 ${
              errors.nome ? "border-red-500" : ""
            }`}
          />
          {errors.nome && (
            <p className="text-sm text-red-400">{errors.nome.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefone" className="text-white/80 text-sm">Telefone (WhatsApp)</Label>
          <Input
            id="telefone"
            placeholder="(00) 00000-0000"
            {...register("telefone")}
            onChange={(e) => {
              const formatted = formatPhone(e.target.value);
              setValue("telefone", formatted);
            }}
            className={`bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white rounded-sm h-12 ${
              errors.telefone ? "border-red-500" : ""
            }`}
          />
          {errors.telefone && (
            <p className="text-sm text-red-400">{errors.telefone.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-white/80 text-sm">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            {...register("email")}
            className={`bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white rounded-sm h-12 ${
              errors.email ? "border-red-500" : ""
            }`}
          />
          {errors.email && (
            <p className="text-sm text-red-400">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="valorConta" className="text-white/80 text-sm">Valor médio da conta</Label>
          <Input
            id="valorConta"
            placeholder="R$ 0,00"
            {...register("valorConta")}
            onChange={(e) => {
              const formatted = formatCurrency(e.target.value);
              setValue("valorConta", formatted);
            }}
            className={`bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white rounded-sm h-12 ${
              errors.valorConta ? "border-red-500" : ""
            }`}
          />
          {errors.valorConta && (
            <p className="text-sm text-red-400">{errors.valorConta.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="concessionaria" className="text-white/80 text-sm">Concessionária</Label>
          <Select
            value={concessionariaValue}
            onValueChange={(value) => setValue("concessionaria", value)}
          >
            <SelectTrigger 
              className={`bg-white/10 border-white/20 text-white rounded-sm h-12 ${
                errors.concessionaria ? "border-red-500" : ""
              }`}
            >
              <SelectValue placeholder={isLoading ? "Carregando..." : "Selecione"} />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-white/20">
              {concessionarias.map((c) => (
                <SelectItem 
                  key={c.id} 
                  value={c.nome}
                  className="text-white hover:bg-white/10"
                >
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.concessionaria && (
            <p className="text-sm text-red-400">{errors.concessionaria.message}</p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="w-full bg-white text-black hover:bg-white/90 font-medium h-14 rounded-sm mt-6"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Simular Economia
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>

        <p className="text-xs text-center text-white/40 pt-2">
          Sua proposta será enviada por WhatsApp e E-mail
        </p>
      </form>

      {/* Thank You Modal */}
      <ThankYouModal
        isOpen={showThankYou}
        onClose={() => setShowThankYou(false)}
        clienteNome={submittedName}
        isRegionNotSupported={isRegionNotSupported}
      />
    </motion.div>
  );
}

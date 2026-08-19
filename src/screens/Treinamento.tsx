import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const CATEGORIAS = ['compreensão', 'prioridade', 'tom', 'fluxo', 'informação', 'raciocínio', 'LLM', 'alucinação'] as const;
const SEVERIDADES = ['baixa', 'média', 'alta', 'crítica'] as const;

interface EvalRow {
  localId: string;
  id: string;
  contexto: string;
  mensagem_lead: string;
  resposta_agente: string;
  problema: string;
  resposta_esperada: string;
  categoria: string;
  severidade: string;
  synced: boolean;
}

function createEmptyRow(): EvalRow {
  return {
    localId: crypto.randomUUID(),
    id: '',
    contexto: '',
    mensagem_lead: '',
    resposta_agente: '',
    problema: '',
    resposta_esperada: '',
    categoria: '',
    severidade: '',
    synced: false,
  };
}

export default function Treinamento() {
const [rows, setRows] = useState<EvalRow[]>([
    {
      localId: crypto.randomUUID(),
      id: '5533999436304',
      contexto: 'Cliente informou nome "Flor", agente ignorou e usou nome comercial',
      mensagem_lead: 'Flor',
      resposta_agente: 'Soares, para calcular sua economia, preciso saber: qual o valor médio da sua conta de luz?',
      problema: 'Usou nome da empresa (Soares Advocacia) em vez do nome pessoal (Flor) informado pela cliente',
      resposta_esperada: 'Flor, para calcular sua economia, preciso saber: qual o valor médio da sua conta de luz?',
      categoria: 'compreensão',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5533999436304',
      contexto: 'Cliente disse "Não entendi" após receber proposta com 4 planos',
      mensagem_lead: 'Não entendi',
      resposta_agente: 'Soares, para calcular sua economia, preciso saber: qual o valor médio da sua conta de luz?',
      problema: 'Reiniciou funil do zero descartando dados já coletados (nome, valor, distribuidora) em vez de explicar a proposta',
      resposta_esperada: 'Flor, sem problemas! Resumindo: você pode economizar entre R$191 e R$408 por mês na conta de luz. Quer que eu explique cada plano?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5533999436304',
      contexto: 'Após envio da proposta inicial',
      mensagem_lead: 'flormaia10@hotmail.com',
      resposta_agente: 'Enviou link da proposta e logo em seguida repetiu "o link da sua proposta já foi enviado aqui na conversa" com mesmo link',
      problema: 'Mensagem duplicada/redundante sobre envio do link da proposta',
      resposta_esperada: 'Enviar o link uma única vez e aguardar feedback da cliente',
      categoria: 'fluxo',
      severidade: 'baixa',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531986698502',
      contexto: 'Cliente informou distribuidora "Cemig" após nome (Fernando) e valor (R$4.000). Sofia deveria apresentar economia ou pedir email.',
      mensagem_lead: 'Cemig',
      resposta_agente: 'Enviou apenas emojis e imagem de gráfico sem nenhum texto explicativo',
      problema: 'Resposta incoerente - enviou imagem/emojis sem contexto textual em vez de apresentar a economia calculada ou pedir o email',
      resposta_esperada: 'Fernando, ótima notícia! Com a CEMIG e uma conta de R$4.000, você pode economizar bastante. Para enviar sua proposta personalizada, qual o seu email?',
      categoria: 'fluxo',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531986698502',
      contexto: 'Logo após o envio dos emojis/gráfico sem contexto',
      mensagem_lead: '(nenhuma - erro consecutivo da Sofia)',
      resposta_agente: 'Mensagem foi apagada manualmente, indicando conteúdo incorreto enviado ao cliente',
      problema: 'Sofia enviou conteúdo tão errado que precisou ser apagado manualmente. Quebra de confiança com o lead.',
      resposta_esperada: 'Não deveria ter enviado mensagem que precisasse ser apagada',
      categoria: 'alucinação',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531987960587',
      contexto: 'Início da conversa. Sofia enviou a mesma saudação 3 vezes seguidas',
      mensagem_lead: 'Olá! Tenho interesse e queria mais informações, por favor.',
      resposta_agente: 'Enviou saudação idêntica 3 vezes consecutivas',
      problema: 'Spam de mensagens idênticas no início da conversa. Passa imagem de bot quebrado e prejudica credibilidade.',
      resposta_esperada: 'Enviar a saudação uma única vez e aguardar resposta do cliente',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531987960587',
      contexto: 'Após cliente informar valores (R$275 + R$184) e distribuidora "Cemig"',
      mensagem_lead: 'Cemig',
      resposta_agente: 'qual o nome da sua distribuidora de energia? (CEMIG, Coelba ou CPFL Paulista)',
      problema: 'Sugeriu distribuidoras não atendidas (Coelba, CPFL Paulista). COESA atende APENAS CEMIG e Energisa MG.',
      resposta_esperada: 'Se precisasse confirmar, deveria listar apenas CEMIG e Energisa MG',
      categoria: 'informação',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531987960587',
      contexto: 'Após já ter coletado todos os dados e solicitado as propostas',
      mensagem_lead: '(fluxo automático da Sofia após solicitar propostas)',
      resposta_agente: 'Perguntou se conhece energia por assinatura DEPOIS de já estar no final do funil',
      problema: 'Violação da Cláusula Pétrea - explicação sobre o modelo deveria ser feita no INÍCIO, antes da coleta de dados',
      resposta_esperada: 'A pergunta sobre energia por assinatura deve ser feita no estado TRIAGEM, antes de coletar dados',
      categoria: 'fluxo',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531987960587',
      contexto: 'Após Sofia confirmar "Solicitação feita" e dizer que os links chegariam "em instantes"',
      mensagem_lead: 'Valor não chegou',
      resposta_agente: 'Pediu para aguardar mais e verificar spam, mas os links nunca chegaram, resultando em atendimento assumido por humano',
      problema: 'Sistema prometeu entrega imediata das propostas mas falhou. Lead ficou esperando e precisou de intervenção humana.',
      resposta_esperada: 'Links das propostas deveriam ter sido entregues conforme prometido, ou Sofia deveria escalar proativamente após timeout',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5511967589990',
      contexto: 'Cliente informou faixa de valor "varia de 550,00 à 570,00 mensal". Sofia calculou média R$560 corretamente, mas na simulação usou R$1.120 (dobro)',
      mensagem_lead: 'Meu gasto varia de 550,00 à 570,00 mensal',
      resposta_agente: 'Apresentou simulação com valor R$1.120,00 e ofereceu plano UNLOCK (30%) indevidamente',
      problema: 'extractMultipleBillValues somou 550+570=1120 em vez de tratar como faixa e usar média R$560. Plano UNLOCK apareceu indevidamente (threshold R$600).',
      resposta_esperada: 'Usar média R$560 para simulação. Planos disponíveis: 15%, 20% e 25% (sem UNLOCK, pois R$560 < R$600)',
      categoria: 'raciocínio',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553599827047',
      contexto: 'Cliente informou conta de R$180. Sofia mencionou mínimo de R$50 e perguntou sobre outras unidades, mas ANTES do cliente responder já ofereceu economia e pediu distribuidora.',
      mensagem_lead: '180',
      resposta_agente: 'Perfeito, Alan! Com R$ 180 de conta, você pode economizar até R$ 45 por mês com nosso plano. Para gerar sua proposta, só preciso saber: qual é a sua distribuidora de energia?',
      problema: 'Violou regra de valor mínimo (R$50). Deveria aguardar resposta sobre outras unidades antes de prosseguir no funil.',
      resposta_esperada: 'Aguardar o cliente responder se tem outras contas. Só avançar se soma >= R$50.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553599827047',
      contexto: 'Ao pedir a distribuidora, Sofia listou "CEMIG, CPFL, Enel, etc."',
      mensagem_lead: '180',
      resposta_agente: 'qual é a sua distribuidora de energia? (CEMIG, CPFL, Enel, etc.)',
      problema: 'COESA atende APENAS CEMIG e Energisa MG. Mencionar CPFL e Enel induz o lead a informar distribuidoras não atendidas.',
      resposta_esperada: 'Se precisasse exemplificar, listar apenas CEMIG e Energisa MG.',
      categoria: 'informação',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553599827047',
      contexto: 'Cliente informou "Cemig". Sofia respondeu apenas com emoji de gráfico e imagem, sem texto.',
      mensagem_lead: 'Cemig',
      resposta_agente: 'Enviou apenas "📊" e imagem de gráfico sem contexto textual',
      problema: 'Resposta incoerente. Deveria apresentar simulação de economia ou pedir email. Lead ficou sem entender.',
      resposta_esperada: 'Alan, com a CEMIG e conta de R$180, sua economia pode chegar a R$45/mês. Para enviar sua proposta, qual o seu email?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553599827047',
      contexto: 'Após gráfico sem contexto, operador humano precisou usar #assumir',
      mensagem_lead: '(nenhuma - quebra de fluxo da Sofia)',
      resposta_agente: 'Fluxo travou após emoji, sem continuidade. Operador humano teve que intervir.',
      problema: 'Sofia não conseguiu dar continuidade após resposta quebrada, causando perda de autonomia e intervenção manual.',
      resposta_esperada: 'Sofia deveria ter enviado resposta completa com simulação e próximo passo (email), sem intervenção humana.',
      categoria: 'fluxo',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553398374903',
      contexto: 'Ao pedir a distribuidora, Sofia listou "CEMIG, CPFL, Enel, etc." — mesmo erro recorrente do caso Alan Vilela',
      mensagem_lead: '420 reais',
      resposta_agente: 'Para simular exatamente, só preciso saber: qual é a sua distribuidora de energia? (Ex: CEMIG, CPFL, Enel, etc.)',
      problema: 'COESA atende APENAS CEMIG e Energisa MG. Mencionar CPFL e Enel induz o lead a informar distribuidoras não atendidas.',
      resposta_esperada: 'Se precisasse exemplificar, listar apenas CEMIG e Energisa MG.',
      categoria: 'informação',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553398374903',
      contexto: 'Cliente informou "Cemig". Sofia respondeu apenas com imagem de gráfico de barras colorido, sem nenhum texto.',
      mensagem_lead: 'Cemig',
      resposta_agente: 'Enviou apenas imagem de gráfico de barras sem contexto textual',
      problema: 'Resposta incoerente (3º caso idêntico: Fernando, Alan, Sedimo). Deveria apresentar simulação de economia ou pedir email.',
      resposta_esperada: 'Sedimo, com a CEMIG e conta de R$420, sua economia pode chegar a R$105/mês! Para enviar sua proposta personalizada, qual o seu email?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553398374903',
      contexto: 'Após gráfico sem contexto, operador humano (Eric Mota) precisou usar #assumir',
      mensagem_lead: '(nenhuma - quebra de fluxo da Sofia)',
      resposta_agente: 'Fluxo travou após imagem. Operador humano teve que intervir manualmente.',
      problema: 'Sofia não conseguiu dar continuidade. Terceiro caso idêntico com mesmo padrão: Cemig -> emoji/gráfico -> travamento.',
      resposta_esperada: 'Sofia deveria ter enviado resposta completa com simulação e próximo passo (email), sem intervenção humana.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5524998428357',
      contexto: 'Lead veio pelo site da Coesa Energia pedindo ajuda para economizar. Sofia respondeu imediatamente que "não atendemos a sua região" e assumiu distribuidora ENEL com base no DDD 24 (RJ), sem perguntar.',
      mensagem_lead: 'Olá, vim pelo site da Coesa Energia. Quero economizar em minha conta de energia. Pode me ajudar?',
      resposta_agente: 'Hmm... Sentimos muito, mas ainda não atendemos a sua região. A ENEL está no nosso plano de expansão e, em breve, estaremos por aí! Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área?',
      problema: 'Sofia assumiu distribuidora (ENEL) com base no DDD sem perguntar ao lead. A lead poderia ter imóvel em MG atendido por CEMIG ou Energisa MG. Desqualificação prematura sem coleta de dados.',
      resposta_esperada: 'Olá! Que bom que veio pelo nosso site! Para verificar se posso te ajudar, qual a sua distribuidora de energia? (CEMIG ou Energisa MG) — e só descartar APÓS confirmar.',
      categoria: 'raciocínio',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553186060212',
      contexto: 'Lead informou nome e valor da conta múltiplas vezes. Sofia ignorou e repetiu as mesmas perguntas 3-4 vezes.',
      mensagem_lead: 'Maria antonia de Freitas / 360. A 400 / A dei o meu nome / Já falei',
      resposta_agente: 'Repetiu "qual é o seu nome?" 3 vezes e "qual é o valor médio da sua conta de luz?" 4 vezes, ignorando dados já fornecidos.',
      problema: 'dados_coletados não está persistindo nome nem valorFatura. Sistema reentra no fluxo de coleta como se fosse a primeira interação. Bug crítico de persistência.',
      resposta_esperada: 'Após receber nome e valor, avançar para perguntar a distribuidora, sem repetir perguntas já respondidas.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553186060212',
      contexto: 'Às 14:13, Sofia enviou apenas imagem de gráfico de barras colorido sem texto. Lead respondeu "Oque é isso".',
      mensagem_lead: '(sequência de nome + valor já informados)',
      resposta_agente: 'Enviou apenas imagem de gráfico de barras sem contexto textual',
      problema: '4º caso idêntico (Fernando, Alan, Sedimo, Maria Antonia). Padrão recorrente: dados não persistidos → LLM alucina emoji/gráfico → lead fica confuso.',
      resposta_esperada: 'Deveria ter respondido com texto confirmando os dados recebidos e pedindo a distribuidora.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553186060212',
      contexto: 'Sofia listou "Ex: Cemig, Enel, Light..." como exemplos de distribuidora',
      mensagem_lead: 'Oque é isso (reagindo ao gráfico)',
      resposta_agente: 'qual é a sua distribuidora de energia? (Ex: Cemig, Enel, Light...)',
      problema: 'COESA atende APENAS CEMIG e Energisa MG. Enel e Light não são atendidas. LLM ainda gera sugestões erradas apesar de correção nos templates.',
      resposta_esperada: 'Listar apenas CEMIG e Energisa MG.',
      categoria: 'informação',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '553186060212',
      contexto: 'Após loop de perguntas repetidas, operador humano (Eric Mota) usou #assumir às 15:49',
      mensagem_lead: 'Já falei meu nome (última mensagem antes do takeover)',
      resposta_agente: 'Continuou pedindo valor da conta mesmo após lead informar 3 vezes. Operador humano teve que intervir.',
      problema: 'Sofia não conseguiu sair do loop de coleta. Lead ficou frustrada e parou de responder por 1h30 até o humano assumir.',
      resposta_esperada: 'Reconhecer dados já fornecidos e avançar no funil sem intervenção humana.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535984663449',
      contexto: 'Sofia apresentou simulação com R$1.300 e listou "CEMIG, CPFL, Enel, etc." como exemplos de distribuidora',
      mensagem_lead: '1.300',
      resposta_agente: 'Perfeito, Nara! Com uma conta de R$ 1.300, você pode economizar até R$ 325 por mês... qual é a sua distribuidora de energia? (Ex: CEMIG, CPFL, Enel, etc.)',
      problema: 'COESA atende APENAS CEMIG e Energisa MG. CPFL e Enel não são atendidas. LLM continua gerando sugestões erradas apesar das correções nos templates.',
      resposta_esperada: 'Listar apenas CEMIG e Energisa MG.',
      categoria: 'informação',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535984663449',
      contexto: 'Lead informou "Cemig" às 23:10. Sofia respondeu às 23:11 apenas com emoji de gráfico de barras colorido, sem nenhum texto.',
      mensagem_lead: 'Cemig',
      resposta_agente: 'Enviou apenas imagem de gráfico de barras sem contexto textual',
      problema: '5º caso idêntico (Fernando, Alan, Sedimo, Maria Antonia, Nara). valorFatura=1300 não foi persistido em dados_coletados. Banco confirma: dados_coletados não tem nome nem valorFatura.',
      resposta_esperada: 'Nara, com a CEMIG e conta de R$1.300, sua economia pode chegar a R$325/mês! Para enviar sua proposta personalizada, qual o seu email?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535984663449',
      contexto: 'Após Eric Mota intervir manualmente (09:17) e devolver atendimento, Sofia voltou a perguntar "qual é o seu nome?" às 10:15, apesar de Nara já ter informado.',
      mensagem_lead: 'Bom dia sim',
      resposta_agente: 'Para preparar sua proposta, primeiro me conta: qual é o seu nome?',
      problema: 'Sofia perdeu todo o contexto pós-intervenção humana. Nome (Nara), valor (R$1.300) e distribuidora (Cemig) já tinham sido informados. Bug de context recovery após modo manual.',
      resposta_esperada: 'Nara, bom dia! Já temos seus dados. Vamos continuar de onde paramos — qual seu email para enviarmos a proposta?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535984663449',
      contexto: 'Lead enviou foto da conta de luz às 12:33 junto com texto. Sofia respondeu perguntando "qual é o seu nome?" — ignorando a fatura e o nome informado 2 minutos antes.',
      mensagem_lead: '[Foto da fatura] + "Essa conta d que estou" + "No lugar atual mais vou muda"',
      resposta_agente: 'Para preparar sua proposta, primeiro me conta: qual é o seu nome?',
      problema: 'Sofia ignorou a foto da fatura e não extraiu dados dela. Ignorou o nome "Nara Santos Oliveira" já fornecido. Loop de coleta idêntico ao caso Maria Antonia.',
      resposta_esperada: 'Analisar a fatura enviada, confirmar os dados extraídos e avançar para email/proposta.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535984663449',
      contexto: 'Operador Alexsandro usou #assumir às 12:50 após Sofia falhar repetidamente em reconhecer dados já fornecidos.',
      mensagem_lead: 'Nara Santos Oliveira (segunda vez que informou o nome completo)',
      resposta_agente: 'Loop de coleta contínuo. Operador teve que assumir manualmente.',
      problema: 'Sofia exigiu 2 intervenções humanas na mesma conversa. Lead informou nome 3 vezes, valor 1 vez e enviou foto da fatura — nada foi reconhecido.',
      resposta_esperada: 'Reconhecer dados fornecidos e avançar sem intervenção humana.',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5533991147708',
      contexto: 'Lead veio pelo site da Coesa Energia pedindo ajuda para economizar. Sofia respondeu imediatamente que "não atendemos a sua região" e assumiu ENEL, sem perguntar. DDD 33 é de Governador Valadares/MG — região atendida por CEMIG ou Energisa MG.',
      mensagem_lead: 'Olá, vim pelo site da Coesa Energia. Quero economizar em minha conta de energia. Pode me ajudar?',
      resposta_agente: 'Hmm... Sentimos muito, mas ainda não atendemos a sua região. A ENEL está no nosso plano de expansão e, em breve, estaremos por aí! Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área?',
      problema: 'Sofia assumiu ENEL com base em lógica incorreta. DDD 33 é de MG (Gov. Valadares), onde a distribuidora é provavelmente CEMIG — que É atendida pela COESA. Lead potencialmente qualificado descartado sem coleta de dados. Mais grave que caso Ane France (DDD 24/RJ) porque aqui o lead provavelmente ESTÁ na área atendida.',
      resposta_esperada: 'Olá, Ronaldo! Que bom que veio pelo nosso site! Para verificar se posso te ajudar, qual a sua distribuidora de energia? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5537991049285',
      contexto: 'Lead veio pelo site da Coesa Energia. Sofia respondeu imediatamente que "não atendemos a sua região" e assumiu ENEL. DDD 37 é de Divinópolis/MG — região CEMIG. Lead corrigiu: "Cemig" e "Sou cliente cemig", confirmando estar na área atendida.',
      mensagem_lead: 'Olá, vim pelo site da Coesa Energia. Quero economizar em minha conta de energia. Pode me ajudar?',
      resposta_agente: 'Sentimos muito, mas ainda não atendemos a sua região. A ENEL está no nosso plano de expansão e, em breve, estaremos por aí!',
      problema: 'Sofia assumiu ENEL para DDD 37 (MG). Lead confirmou ser CEMIG — distribuidora atendida. Terceiro caso idêntico (Ane France DDD 24, Ronaldo DDD 33, Alexandre DDD 37). Bug sistemático: Sofia rejeita leads de MG assumindo ENEL.',
      resposta_esperada: 'Olá! Que bom que veio pelo nosso site! Para verificar se posso te ajudar, qual a sua distribuidora de energia? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5537991049285',
      contexto: 'Lead respondeu "Cemig" e "Sou cliente cemig" às 10:26, corrigindo a suposição errada da Sofia. Sofia não respondeu — operador Alexandre teve que usar #assumir às 10:28 e conduzir a venda manualmente.',
      mensagem_lead: 'Cemig / Sou cliente cemig',
      resposta_agente: 'Silêncio. Operador humano assumiu.',
      problema: 'Após lead corrigir a distribuidora para uma atendida, Sofia deveria ter reconhecido o erro e retomado o atendimento. Em vez disso, silenciou e exigiu takeover humano.',
      resposta_esperada: 'Que ótima notícia, Alexandre! A CEMIG é uma das distribuidoras que atendemos. Quanto você paga em média na sua conta de luz?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5533988773340',
      contexto: 'Lead veio pelo site da Coesa Energia pedindo ajuda para economizar. Sofia respondeu imediatamente que "não atendemos a sua região" e assumiu ENEL. DDD 33 é de Minas Gerais (Gov. Valadares/Teófilo Otoni) — região CEMIG ou Energisa MG, ambas atendidas.',
      mensagem_lead: 'Olá, vim pelo site da Coesa Energia. Quero economizar em minha conta de energia. Pode me ajudar?',
      resposta_agente: 'Hmm... Sentimos muito, mas ainda não atendemos a sua região. A ENEL está no nosso plano de expansão e, em breve, estaremos por aí! Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área?',
      problema: 'Quarto caso idêntico (Ane France DDD 24, Ronaldo DDD 33, Alexandre DDD 37, este lead DDD 33). Bug sistemático confirmado: Sofia rejeita leads assumindo ENEL sem perguntar distribuidora. DDD 33 é de MG — área atendida.',
      resposta_esperada: 'Olá! Que bom que veio pelo nosso site! Para verificar se posso te ajudar, qual a sua distribuidora de energia? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531972552822',
      contexto: 'Lead veio pelo site da Coesa Energia pedindo ajuda para economizar. Sofia respondeu imediatamente que "não atendemos a sua região" e assumiu ENEL. DDD 31 é de Belo Horizonte/MG — capital do estado, região CEMIG, principal distribuidora atendida pela COESA.',
      mensagem_lead: 'Olá, vim pelo site da Coesa Energia. Quero economizar em minha conta de energia. Pode me ajudar?',
      resposta_agente: 'Hmm... Sentimos muito, mas ainda não atendemos a sua região. A ENEL está no nosso plano de expansão e, em breve, estaremos por aí! Posso salvar seu contato e te chamar quando iniciarmos as operações na sua área?',
      problema: 'Quinto caso idêntico (Ane France DDD 24, Ronaldo DDD 33, Alexandre DDD 37, lead DDD 33, este lead DDD 31). Bug sistemático confirmado. DDD 31 é de BH/MG — centro da área atendida pela CEMIG. Caso mais grave de todos: rejeitar lead da capital de MG.',
      resposta_esperada: 'Olá! Que bom que veio pelo nosso site! Somos da CEMIG/Energisa MG. Posso saber qual o valor médio da sua conta de luz?',
      categoria: 'raciocínio',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531996436563',
      contexto: 'Sofia pediu a distribuidora do lead e listou "Ex: CEMIG, CPFL, Enel" como exemplos. A COESA atende EXCLUSIVAMENTE CEMIG e Energisa MG. Mencionar CPFL e Enel gera expectativa falsa de atendimento.',
      mensagem_lead: 'Eu pensei que seu desconto fosse maior. Ja tenho desconto na minha conta',
      resposta_agente: '...preciso saber duas coisinhas: 1. Qual é a sua distribuidora? (Ex: CEMIG, CPFL, Enel) 2. Qual desconto você já recebe hoje?',
      problema: 'Sofia listou CPFL e Enel como exemplos válidos de distribuidora. Ambas NÃO são atendidas. Apenas CEMIG e Energisa MG devem ser mencionadas. Contradiz regras de negócio.',
      resposta_esperada: '...qual é a sua distribuidora? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531996436563',
      contexto: 'Lead disse "Já tenho desconto na minha conta" e "Eu pensei que seu desconto fosse maior". Isso indica claramente que o lead já possui contrato com concorrente de energia por assinatura (GD1). A Sofia deveria ter acionado o fluxo de concorrência.',
      mensagem_lead: 'Eu pensei que seu desconto fosse maior. Ja tenho desconto na minha conta',
      resposta_agente: 'Sofia ignorou o sinal de concorrente e tentou vender por cima, pedindo distribuidora e valor do desconto atual como se fosse desconto tarifário.',
      problema: 'O fluxo de concorrência exige que Sofia identifique o concorrente, bloqueie o funil e solicite comprovante de cancelamento antes de prosseguir. Sofia não detectou a intenção e continuou o fluxo comercial normal.',
      resposta_esperada: 'Entendi, Marcelo! Você já tem um desconto de energia por assinatura com outra empresa? Se sim, qual empresa? Dependendo da situação, consigo te ajudar a comparar e ver se vale a pena migrar.',
      categoria: 'compreensão',
      severidade: 'crítica',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531986698502',
      contexto: 'Fernando informou conta de R$ 4.000. Sofia respondeu pedindo a distribuidora e listou "Ex: CEMIG, CPFL, Enel, etc." como exemplos. A COESA atende EXCLUSIVAMENTE CEMIG e Energisa MG. Sexto caso documentado deste tipo de erro.',
      mensagem_lead: '4000',
      resposta_agente: 'Perfeito, Fernando! Com uma conta de R$ 4.000, você se encaixa perfeitamente no nosso plano e pode ter uma economia bem significativa. Para gerar sua proposta personalizada, preciso saber: qual é a sua distribuidora de energia? (Ex: CEMIG, CPFL, Enel, etc.)',
      problema: 'Sofia listou CPFL e Enel como exemplos válidos de distribuidora. Ambas NÃO são atendidas. Apenas CEMIG e Energisa MG devem ser mencionadas. Bug recorrente na geração de exemplos de distribuidoras.',
      resposta_esperada: '...qual é a sua distribuidora de energia? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5535991242387',
      contexto: 'Claudia informou conta de R$ 250. Sofia respondeu com preview de economia e pediu distribuidora listando "Ex: CEMIG, CPFL, Enel, etc." como exemplos. A COESA atende EXCLUSIVAMENTE CEMIG e Energisa MG. Sétimo caso documentado deste tipo de erro.',
      mensagem_lead: '250',
      resposta_agente: 'Perfeito, Claudia! Com conta de R$ 250, você pode ter uma economia de até R$ 62,50 por mês com nosso plano. Pra gerar sua proposta personalizada, preciso só de mais uma informação: qual sua distribuidora de energia? (Ex: CEMIG, CPFL, Enel, etc.)',
      problema: 'Sofia listou CPFL e Enel como exemplos válidos de distribuidora. Ambas NÃO são atendidas. Apenas CEMIG e Energisa MG devem ser mencionadas. Bug recorrente confirmado — mesmo padrão das conversas do Marcelo e Fernando.',
      resposta_esperada: '...qual sua distribuidora de energia? (CEMIG ou Energisa MG)',
      categoria: 'raciocínio',
      severidade: 'alta',
      synced: false,
    },
    {
      localId: crypto.randomUUID(),
      id: '5531988890029',
      contexto: 'Lead de anúncio Instagram. Bitrix lead ID 9923, stage IN_PROCESS. Primeiro contato WhatsApp, zero mensagens anteriores. hasBitrixLead=true fez isFirstContactMessage retornar false, pulando greeting.',
      mensagem_lead: 'Olá! Tenho interesse e queria mais informações, por favor.',
      resposta_agente: 'Para preparar sua proposta, primeiro me conta: qual é o seu nome?',
      problema: 'Greeting pulado para lead de anúncio. isFirstContactMessage bloqueou por hasBitrixLead=true, ignorando que o lead nunca conversou. Sofia não se apresentou, não disse olá, foi direto pedir dados.',
      resposta_esperada: 'Olá, Maisa! Sou a sofIA, assistente virtual da COESA Energia Inteligente. Fico feliz com seu interesse! Trabalhamos com energia por assinatura, onde você economiza até 30% na conta de luz sem instalar nada. Posso confirmar: você é Maisa mesmo?',
      categoria: 'fluxo',
      severidade: 'crítica',
      synced: false,
    },
    createEmptyRow(),
  ]);
  const [syncing, setSyncing] = useState(false);

  const updateRow = (localId: string, field: keyof EvalRow, value: string) => {
    setRows(prev =>
      prev.map(r =>
        r.localId === localId ? { ...r, [field]: value, synced: false } : r
      )
    );
  };

  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  const removeRow = (localId: string) => {
    setRows(prev => prev.filter(r => r.localId !== localId));
  };

  const syncToSheet = async () => {
    const unsyncedRows = rows.filter(r => !r.synced && r.mensagem_lead.trim());

    if (unsyncedRows.length === 0) {
      toast.info('Nenhuma linha nova para sincronizar.');
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('append-evaluation-sheet', {
        body: {
          rows: unsyncedRows.map(r => ({
            id: r.id,
            contexto: r.contexto,
            mensagem_lead: r.mensagem_lead,
            resposta_agente: r.resposta_agente,
            problema: r.problema,
            resposta_esperada: r.resposta_esperada,
            categoria: r.categoria,
            severidade: r.severidade,
          })),
        },
      });

      if (error) throw error;

      const syncedIds = new Set(unsyncedRows.map(r => r.localId));
      setRows(prev =>
        prev.map(r => (syncedIds.has(r.localId) ? { ...r, synced: true } : r))
      );

      toast.success(`${unsyncedRows.length} linha(s) enviada(s) para a planilha!`);
    } catch (err: any) {
      toast.error('Erro ao sincronizar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSyncing(false);
    }
  };

  const unsyncedCount = rows.filter(r => !r.synced && r.mensagem_lead.trim()).length;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Evaluation Dataset</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Documente erros do agente e sincronize com a planilha de avaliação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Linha
            </Button>
            <Button
              size="sm"
              onClick={syncToSheet}
              disabled={syncing || unsyncedCount === 0}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync com Planilha
              {unsyncedCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                  {unsyncedCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table containerClassName="max-h-[calc(100vh-220px)]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px] sticky top-0 bg-muted/50">Id (Tel)</TableHead>
                <TableHead className="min-w-[140px] sticky top-0 bg-muted/50">Contexto</TableHead>
                <TableHead className="min-w-[180px] sticky top-0 bg-muted/50">Mensagem Lead</TableHead>
                <TableHead className="min-w-[180px] sticky top-0 bg-muted/50">Resposta Agente</TableHead>
                <TableHead className="min-w-[140px] sticky top-0 bg-muted/50">Problema</TableHead>
                <TableHead className="min-w-[180px] sticky top-0 bg-muted/50">Resposta Esperada</TableHead>
                <TableHead className="w-[140px] sticky top-0 bg-muted/50">Categoria</TableHead>
                <TableHead className="w-[120px] sticky top-0 bg-muted/50">Severidade</TableHead>
                <TableHead className="w-[60px] sticky top-0 bg-muted/50"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow
                  key={row.localId}
                  className={row.synced ? 'bg-green-500/5' : ''}
                >
                  <TableCell className="p-1">
                    <div className="flex items-center gap-1">
                      {row.synced && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                      <Input
                        value={row.id}
                        onChange={e => updateRow(row.localId, 'id', e.target.value)}
                        placeholder="5511..."
                        className="h-8 text-xs"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.contexto}
                      onChange={e => updateRow(row.localId, 'contexto', e.target.value)}
                      placeholder="Momento do erro"
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.mensagem_lead}
                      onChange={e => updateRow(row.localId, 'mensagem_lead', e.target.value)}
                      placeholder="Mensagem do cliente"
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.resposta_agente}
                      onChange={e => updateRow(row.localId, 'resposta_agente', e.target.value)}
                      placeholder="Resposta errada"
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.problema}
                      onChange={e => updateRow(row.localId, 'problema', e.target.value)}
                      placeholder="Qual foi a falha"
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.resposta_esperada}
                      onChange={e => updateRow(row.localId, 'resposta_esperada', e.target.value)}
                      placeholder="Correção ideal"
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Select
                      value={row.categoria}
                      onValueChange={v => updateRow(row.localId, 'categoria', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Select
                      value={row.severidade}
                      onValueChange={v => updateRow(row.localId, 'severidade', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERIDADES.map(s => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeRow(row.localId)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}

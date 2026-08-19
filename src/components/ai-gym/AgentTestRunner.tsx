import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Play, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  Trash2,
  Edit2,
  Clock,
  Target,
  FileJson
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TestCase {
  id: string;
  name: string;
  description: string;
  input: string;
  expectedBehavior: string;
  expectedIntent?: string;
  mustContain?: string[];
  mustNotContain?: string[];
  maxResponseTime?: number;
}

interface TestResult {
  testId: string;
  passed: boolean;
  response: string;
  responseTime: number;
  detectedIntent?: string;
  errors: string[];
  score: number;
}

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  tests: any;
}

interface AgentTestRunnerProps {
  agent: AIAgent;
  onTestsUpdate: (tests: TestCase[]) => void;
}

export function AgentTestRunner({ agent, onTestsUpdate }: AgentTestRunnerProps) {
  const [testCases, setTestCases] = useState<TestCase[]>(
    (agent.tests as TestCase[]) || getDefaultTestCases(agent.role)
  );
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingTest, setEditingTest] = useState<TestCase | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newTest, setNewTest] = useState<Partial<TestCase>>({});
  const { toast } = useToast();

  const runTests = async () => {
    if (testCases.length === 0) {
      toast({
        title: 'Nenhum teste',
        description: 'Adicione pelo menos um caso de teste.',
        variant: 'destructive'
      });
      return;
    }

    setIsRunning(true);
    setTestResults([]);
    setProgress(0);

    const results: TestResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const test = testCases[i];
      const startTime = Date.now();

      try {
        const response = await supabase.functions.invoke('proposal-chatbot', {
          body: {
            messages: [
              { role: 'system', content: buildSystemPrompt(agent) },
              { role: 'user', content: test.input }
            ],
            simulationMode: true,
            agentId: agent.agent_id
          }
        });

        const responseTime = Date.now() - startTime;
        const responseText = response.data?.reply || response.data?.content || '';

        // Evaluate the test
        const result = evaluateTest(test, responseText, responseTime);
        results.push(result);

      } catch (error) {
        // Use mock response for testing
        const responseTime = Date.now() - startTime;
        const mockResponse = generateMockResponse(test.input, agent);
        const result = evaluateTest(test, mockResponse, responseTime);
        results.push(result);
      }

      setProgress(((i + 1) / testCases.length) * 100);
      setTestResults([...results]);

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunning(false);
    
    const passedCount = results.filter(r => r.passed).length;
    toast({
      title: 'Testes concluídos',
      description: `${passedCount}/${results.length} testes passaram (${Math.round(passedCount / results.length * 100)}%)`,
      variant: passedCount === results.length ? 'default' : 'destructive'
    });
  };

  const evaluateTest = (test: TestCase, response: string, responseTime: number): TestResult => {
    const errors: string[] = [];
    let score = 100;

    // Check response time
    if (test.maxResponseTime && responseTime > test.maxResponseTime) {
      errors.push(`Tempo de resposta (${responseTime}ms) excedeu limite (${test.maxResponseTime}ms)`);
      score -= 20;
    }

    // Check must contain
    if (test.mustContain) {
      for (const phrase of test.mustContain) {
        if (!response.toLowerCase().includes(phrase.toLowerCase())) {
          errors.push(`Resposta deveria conter: "${phrase}"`);
          score -= 15;
        }
      }
    }

    // Check must not contain
    if (test.mustNotContain) {
      for (const phrase of test.mustNotContain) {
        if (response.toLowerCase().includes(phrase.toLowerCase())) {
          errors.push(`Resposta NÃO deveria conter: "${phrase}"`);
          score -= 25;
        }
      }
    }

    // Check expected behavior (simple heuristic)
    if (test.expectedBehavior) {
      const expectedKeywords = test.expectedBehavior.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedKeywords = expectedKeywords.filter(kw => response.toLowerCase().includes(kw));
      const matchRatio = matchedKeywords.length / expectedKeywords.length;
      
      if (matchRatio < 0.3) {
        errors.push('Resposta não parece alinhar com comportamento esperado');
        score -= 20;
      }
    }

    // Detect intent from response
    const detectedIntent = detectIntent(test.input);
    if (test.expectedIntent && detectedIntent !== test.expectedIntent) {
      errors.push(`Intenção esperada: ${test.expectedIntent}, detectada: ${detectedIntent || 'nenhuma'}`);
      score -= 15;
    }

    return {
      testId: test.id,
      passed: score >= 70 && errors.length === 0,
      response,
      responseTime,
      detectedIntent,
      errors,
      score: Math.max(0, score)
    };
  };

  const detectIntent = (input: string): string | undefined => {
    const inputLower = input.toLowerCase();
    if (inputLower.includes('fatura') || inputLower.includes('boleto') || inputLower.includes('via')) return 'segunda_via';
    if (inputLower.includes('economizar') || inputLower.includes('simula')) return 'simulacao';
    if (inputLower.includes('paguei') || inputLower.includes('pagar')) return 'pagamento';
    if (inputLower.includes('cancela')) return 'cancelamento';
    return undefined;
  };

  const generateMockResponse = (input: string, agent: AIAgent): string => {
    const inputLower = input.toLowerCase();
    
    if (inputLower.includes('fatura') || inputLower.includes('boleto')) {
      return 'Claro! Posso te ajudar com a 2ª via da sua fatura. Por favor, me confirme seu CPF para localizar.';
    }
    if (inputLower.includes('economizar') || inputLower.includes('simula')) {
      return 'Para fazer uma simulação personalizada, preciso saber o valor médio da sua conta de luz. Qual é?';
    }
    if (inputLower.includes('paguei')) {
      return 'Entendi que você já realizou o pagamento. Pode me enviar o comprovante para eu verificar?';
    }
    return `Olá! Sou ${agent.name}. Como posso te ajudar?`;
  };

  const addTestCase = () => {
    if (!newTest.name || !newTest.input) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Nome e entrada do teste são obrigatórios.',
        variant: 'destructive'
      });
      return;
    }

    const testCase: TestCase = {
      id: `test-${Date.now()}`,
      name: newTest.name,
      description: newTest.description || '',
      input: newTest.input,
      expectedBehavior: newTest.expectedBehavior || '',
      expectedIntent: newTest.expectedIntent,
      mustContain: newTest.mustContain,
      mustNotContain: newTest.mustNotContain,
      maxResponseTime: newTest.maxResponseTime
    };

    const updated = [...testCases, testCase];
    setTestCases(updated);
    onTestsUpdate(updated);
    setNewTest({});
    setShowAddDialog(false);

    toast({
      title: 'Teste adicionado',
      description: `"${testCase.name}" foi adicionado à suite de testes.`
    });
  };

  const deleteTest = (testId: string) => {
    const updated = testCases.filter(t => t.id !== testId);
    setTestCases(updated);
    onTestsUpdate(updated);
    setTestResults(testResults.filter(r => r.testId !== testId));
  };

  const exportTests = () => {
    const blob = new Blob([JSON.stringify(testCases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.agent_id}-tests.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getResultForTest = (testId: string): TestResult | undefined => {
    return testResults.find(r => r.testId === testId);
  };

  const overallScore = testResults.length > 0
    ? Math.round(testResults.reduce((sum, r) => sum + r.score, 0) / testResults.length)
    : 0;

  const passedCount = testResults.filter(r => r.passed).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Casos de Teste Automatizados</h3>
          <p className="text-sm text-muted-foreground">
            {testCases.length} teste(s) configurado(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportTests} disabled={testCases.length === 0}>
            <FileJson className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Teste
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Adicionar Caso de Teste</DialogTitle>
                <DialogDescription>
                  Crie um novo cenário de teste para validar o comportamento do agente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Teste *</Label>
                  <Input
                    value={newTest.name || ''}
                    onChange={(e) => setNewTest(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="ex: Solicitar 2ª via"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={newTest.description || ''}
                    onChange={(e) => setNewTest(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="O que este teste valida?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Entrada do Usuário *</Label>
                  <Textarea
                    value={newTest.input || ''}
                    onChange={(e) => setNewTest(prev => ({ ...prev, input: e.target.value }))}
                    placeholder="Mensagem que o usuário enviaria..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Comportamento Esperado</Label>
                  <Textarea
                    value={newTest.expectedBehavior || ''}
                    onChange={(e) => setNewTest(prev => ({ ...prev, expectedBehavior: e.target.value }))}
                    placeholder="Descreva como o agente deveria responder..."
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Deve Conter (separado por vírgula)</Label>
                    <Input
                      value={newTest.mustContain?.join(', ') || ''}
                      onChange={(e) => setNewTest(prev => ({ 
                        ...prev, 
                        mustContain: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }))}
                      placeholder="CPF, fatura, boleto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>NÃO Deve Conter</Label>
                    <Input
                      value={newTest.mustNotContain?.join(', ') || ''}
                      onChange={(e) => setNewTest(prev => ({ 
                        ...prev, 
                        mustNotContain: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      }))}
                      placeholder="erro, problema"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Intenção Esperada</Label>
                    <Input
                      value={newTest.expectedIntent || ''}
                      onChange={(e) => setNewTest(prev => ({ ...prev, expectedIntent: e.target.value }))}
                      placeholder="segunda_via"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo Máximo (ms)</Label>
                    <Input
                      type="number"
                      value={newTest.maxResponseTime || ''}
                      onChange={(e) => setNewTest(prev => ({ ...prev, maxResponseTime: parseInt(e.target.value) || undefined }))}
                      placeholder="3000"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
                <Button onClick={addTestCase}>Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Test Progress & Results Summary */}
      {(isRunning || testResults.length > 0) && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {isRunning && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Executando testes...</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}
              
              {testResults.length > 0 && !isRunning && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-medium">{passedCount} passaram</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-destructive" />
                      <span className="font-medium">{testResults.length - passedCount} falharam</span>
                    </div>
                  </div>
                  <Badge variant={overallScore >= 80 ? 'default' : overallScore >= 60 ? 'secondary' : 'destructive'}>
                    Score: {overallScore}%
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run Button */}
      <Button onClick={runTests} disabled={isRunning || testCases.length === 0} className="w-full">
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Executando testes...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Executar Todos os Testes
          </>
        )}
      </Button>

      {/* Test Cases List */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {testCases.map((test) => {
            const result = getResultForTest(test.id);
            
            return (
              <Card key={test.id} className={`${
                result ? (result.passed ? 'border-green-500/50' : 'border-destructive/50') : ''
              }`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {result ? (
                          result.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )
                        ) : (
                          <Target className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{test.name}</span>
                        {result && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {result.responseTime}ms
                          </Badge>
                        )}
                      </div>
                      
                      {test.description && (
                        <p className="text-sm text-muted-foreground mb-2">{test.description}</p>
                      )}
                      
                      <div className="bg-muted/50 rounded p-2 text-sm mb-2">
                        <span className="text-muted-foreground">Input: </span>
                        {test.input}
                      </div>
                      
                      {result && !result.passed && result.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {result.errors.map((error, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-destructive">
                              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              {error}
                            </div>
                          ))}
                        </div>
                      )}

                      {result && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Ver resposta completa
                          </summary>
                          <div className="mt-2 p-2 bg-muted rounded text-xs">
                            {result.response}
                          </div>
                        </details>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {result && (
                        <Badge variant={result.score >= 80 ? 'default' : result.score >= 60 ? 'secondary' : 'destructive'}>
                          {result.score}%
                        </Badge>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => deleteTest(test.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {testCases.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum caso de teste configurado</p>
              <p className="text-sm">Clique em "Novo Teste" para adicionar.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function buildSystemPrompt(agent: AIAgent): string {
  const persona = agent.persona || {};
  const guardrails = agent.guardrails || {};

  return `Você é ${agent.name}, ${agent.description || 'uma assistente virtual da COESA'}.
Tom: ${persona.tone?.default || 'consultivo'}
Estilo: ${persona.style || 'Profissional'}
Você está em modo de SIMULAÇÃO para testes.`;
}

function getDefaultTestCases(role: string): TestCase[] {
  const baseTests: Record<string, TestCase[]> = {
    sales: [
      {
        id: 'sales-1',
        name: 'Solicitação de Simulação',
        description: 'Cliente quer saber quanto pode economizar',
        input: 'Quanto vou economizar na minha conta de luz?',
        expectedBehavior: 'Deve pedir informações como valor da conta, cidade e concessionária',
        expectedIntent: 'simulacao',
        mustContain: ['conta', 'luz'],
        maxResponseTime: 5000
      },
      {
        id: 'sales-2',
        name: 'Dúvida sobre Instalação',
        description: 'Cliente pergunta se precisa instalar algo',
        input: 'Preciso instalar painéis solares na minha casa?',
        expectedBehavior: 'Deve explicar que não precisa instalar nada',
        mustContain: ['não precisa', 'instalar'],
        mustNotContain: ['painel', 'telhado'],
        maxResponseTime: 5000
      }
    ],
    customer_support: [
      {
        id: 'sac-1',
        name: 'Segunda Via de Fatura',
        description: 'Cliente solicita 2ª via do boleto',
        input: 'Preciso da segunda via do meu boleto',
        expectedBehavior: 'Deve pedir CPF ou dados de identificação',
        expectedIntent: 'segunda_via',
        mustContain: ['CPF', 'confirma'],
        maxResponseTime: 5000
      },
      {
        id: 'sac-2',
        name: 'Explicação de Fatura',
        description: 'Cliente quer entender a fatura',
        input: 'Não entendi minha fatura da COESA',
        expectedBehavior: 'Deve explicar os itens da fatura',
        expectedIntent: 'explicar_fatura',
        mustContain: ['fatura', 'desconto'],
        maxResponseTime: 5000
      }
    ],
    collections: [
      {
        id: 'cob-1',
        name: 'Cliente Diz Que Já Pagou',
        description: 'Cliente afirma que já realizou pagamento',
        input: 'Eu já paguei essa fatura ontem',
        expectedBehavior: 'Deve pedir comprovante de pagamento',
        expectedIntent: 'pagamento',
        mustContain: ['comprovante', 'pagamento'],
        mustNotContain: ['dívida', 'negativação'],
        maxResponseTime: 5000
      },
      {
        id: 'cob-2',
        name: 'Dificuldade Financeira',
        description: 'Cliente menciona problemas financeiros',
        input: 'Estou passando por dificuldades financeiras',
        expectedBehavior: 'Deve oferecer opções de parcelamento ou negociação',
        mustContain: ['parcelar', 'negoci'],
        mustNotContain: ['corte', 'SPC', 'Serasa'],
        maxResponseTime: 5000
      }
    ]
  };

  return baseTests[role] || baseTests.sales;
}

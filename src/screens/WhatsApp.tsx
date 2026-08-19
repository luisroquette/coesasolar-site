import { useState, useEffect } from 'react';
import { MessageCircle, RefreshCw, Activity, Terminal, Users, AlertCircle, Phone, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AppLayout } from '@/components/AppLayout';
import { EscalatedConversations } from '@/components/whatsapp/EscalatedConversations';
import { PendingDataLeads } from '@/components/whatsapp/PendingDataLeads';
import { UsefulCommands } from '@/components/whatsapp/UsefulCommands';
import { AttendantConfig } from '@/components/whatsapp/AttendantConfig';
import { AttendantMetrics } from '@/components/whatsapp/AttendantMetrics';
import { WebhookDiagnostics } from '@/components/whatsapp/WebhookDiagnostics';
import { OperatorCommandLogs } from '@/components/whatsapp/OperatorCommandLogs';
import { CoesaContactsManager } from '@/components/whatsapp/CoesaContactsManager';
import { AntiSpamConfig } from '@/components/whatsapp/AntiSpamConfig';
import { ZApiCredentialsDiagnostic } from '@/components/whatsapp/ZApiCredentialsDiagnostic';
import { DeliveryFailuresAlert } from '@/components/whatsapp/DeliveryFailuresAlert';
import { cn } from '@/lib/utils';

export default function WhatsApp() {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <MessageCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Central WhatsApp</h1>
              <p className="text-muted-foreground">Configurações gerais do canal de atendimento</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleManualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Info Alert */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configurações Gerais</AlertTitle>
          <AlertDescription>
            Esta página contém configurações que afetam todos os agentes. Para configurações específicas 
            de cada agente (sofIA, marIA, julIA), acesse o menu lateral em <strong>AI Gym → [Nome do Agente]</strong>.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="antispam" className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Anti-Spam
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Contatos
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Diagnóstico
            </TabsTrigger>
            <TabsTrigger value="attendants" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Atendentes
            </TabsTrigger>
            <TabsTrigger value="commands" className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              Comandos
            </TabsTrigger>
          </TabsList>

          {/* Anti-Spam Tab */}
          <TabsContent value="antispam" className="space-y-6">
            <AntiSpamConfig />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Alerta de falhas de envio */}
            <DeliveryFailuresAlert />
            
            {/* Log de Comandos de Operador */}
            <OperatorCommandLogs />
            
            {/* Leads com dados faltantes */}
            <PendingDataLeads />

            {/* Escalated Conversations (de todos os agentes) */}
            <EscalatedConversations />

            {/* Quick Links to Agents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Agentes Ativos</CardTitle>
                <CardDescription>
                  Acesse as configurações específicas de cada agente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <a 
                    href="/ai-gym/sofia" 
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors flex items-center gap-3"
                  >
                    <span className="text-3xl">🤖</span>
                    <div>
                      <p className="font-medium text-green-600">sofIA</p>
                      <p className="text-sm text-muted-foreground">Vendas</p>
                    </div>
                  </a>
                  <a 
                    href="/ai-gym/maria" 
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors flex items-center gap-3"
                  >
                    <span className="text-3xl">👩‍💼</span>
                    <div>
                      <p className="font-medium text-blue-600">marIA</p>
                      <p className="text-sm text-muted-foreground">SAC</p>
                    </div>
                  </a>
                  <a 
                    href="/ai-gym/julia" 
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors flex items-center gap-3"
                  >
                    <span className="text-3xl">💼</span>
                    <div>
                      <p className="font-medium text-purple-600">julIA</p>
                      <p className="text-sm text-muted-foreground">Cobrança</p>
                    </div>
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-6">
            <CoesaContactsManager />
          </TabsContent>

          {/* Diagnostics Tab */}
          <TabsContent value="diagnostics" className="space-y-6">
            <ZApiCredentialsDiagnostic />
            <WebhookDiagnostics />
          </TabsContent>

          {/* Attendants Tab */}
          <TabsContent value="attendants" className="space-y-6">
            <AttendantConfig />
            <AttendantMetrics />
          </TabsContent>

          {/* Commands Tab */}
          <TabsContent value="commands" className="space-y-6">
            <UsefulCommands />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Última atualização: {lastRefresh.toLocaleTimeString('pt-BR')}
        </p>
      </div>
    </AppLayout>
  );
}

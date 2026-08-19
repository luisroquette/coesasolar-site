import { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, QrCode, AlertTriangle, CheckCircle2, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CredentialCheckResult {
  agentId: string;
  agentName: string;
  status: 'connected' | 'disconnected' | 'qr_needed' | 'invalid_token' | 'error' | 'not_configured';
  connected: boolean;
  phoneNumber?: string;
  error?: string;
  usesGlobal: boolean;
  checkedAt: string;
}

interface CheckResponse {
  success: boolean;
  results: CredentialCheckResult[];
  summary: {
    total: number;
    connected: number;
    disconnected: number;
    notConfigured: number;
    needsAttention: number;
  };
  checkedAt: string;
}

export function ZApiCredentialsDiagnostic() {
  const [results, setResults] = useState<CredentialCheckResult[]>([]);
  const [summary, setSummary] = useState<CheckResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkCredentials = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('zapi-credentials-check');
      
      if (error) {
        console.error('Error checking credentials:', error);
        toast.error('Erro ao verificar credenciais');
        return;
      }
      
      if (data?.success) {
        setResults(data.results || []);
        setSummary(data.summary || null);
        setLastCheck(new Date());
        
        if (data.summary?.needsAttention > 0) {
          toast.warning(`${data.summary.needsAttention} agente(s) precisam de atenção`);
        } else if (data.summary?.total > 0) {
          toast.success('Todos os agentes conectados');
        }
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao verificar credenciais');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  useEffect(() => {
    checkCredentials();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(checkCredentials, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: CredentialCheckResult['status']) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case 'qr_needed':
        return <QrCode className="h-4 w-4 text-yellow-500" />;
      case 'invalid_token':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'not_configured':
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (result: CredentialCheckResult) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      connected: 'default',
      disconnected: 'destructive',
      qr_needed: 'secondary',
      invalid_token: 'destructive',
      error: 'destructive',
      not_configured: 'outline',
    };
    
    const labels: Record<string, string> = {
      connected: 'Conectado',
      disconnected: 'Desconectado',
      qr_needed: 'QR Necessário',
      invalid_token: 'Token Inválido',
      error: 'Erro',
      not_configured: 'Não Configurado',
    };
    
    return (
      <Badge 
        variant={variants[result.status] || 'outline'}
        className={cn(
          result.status === 'connected' && 'bg-green-500/10 text-green-600 border-green-200'
        )}
      >
        {labels[result.status] || result.status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Diagnóstico Z-API</CardTitle>
          <CardDescription>Verificando credenciais dos agentes...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            Diagnóstico Z-API
            {summary && summary.needsAttention > 0 && (
              <Badge variant="destructive" className="ml-2">
                {summary.needsAttention} problema(s)
              </Badge>
            )}
            {summary && summary.needsAttention === 0 && summary.total > 0 && (
              <Badge variant="default" className="ml-2 bg-green-500/10 text-green-600 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Todos OK
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Status das conexões WhatsApp de cada agente
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkCredentials}
          disabled={checking}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", checking && "animate-spin")} />
          Verificar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Nenhum agente encontrado</AlertTitle>
            <AlertDescription>
              Não há agentes com canal WhatsApp configurado.
            </AlertDescription>
          </Alert>
        ) : (
          results.map((result) => (
            <div
              key={result.agentId}
              className={cn(
                "flex items-center gap-4 p-3 border rounded-lg transition-colors",
                result.connected ? "border-green-200 bg-green-50/50 dark:bg-green-950/20" : 
                result.status === 'not_configured' ? "border-muted" :
                "border-red-200 bg-red-50/50 dark:bg-red-950/20"
              )}
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-background border">
                {getStatusIcon(result.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{result.agentName}</p>
                  {result.usesGlobal && (
                    <Badge variant="outline" className="text-xs">
                      <Globe className="h-3 w-3 mr-1" />
                      Global
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {result.phoneNumber ? (
                    <>📱 {result.phoneNumber}</>
                  ) : result.error ? (
                    <span className="text-destructive">{result.error}</span>
                  ) : (
                    `ID: ${result.agentId}`
                  )}
                </p>
              </div>
              {getStatusBadge(result)}
            </div>
          ))
        )}
        
        {lastCheck && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Última verificação: {lastCheck.toLocaleTimeString('pt-BR')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

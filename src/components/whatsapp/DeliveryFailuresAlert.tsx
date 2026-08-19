import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { AlertTriangle, CheckCircle2, MessageSquareWarning, RefreshCw, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DeliveryFailure {
  id: string;
  title: string;
  message: string;
  created_at: string;
  entity_id: string | null;
}

export function DeliveryFailuresAlert() {
  const { intervalDeliveryFailuresMs, realtimeDeliveryFailuresLimit, queryLimitDeliveryFailuresDetail } = useUIConfig();
  const [failures, setFailures] = useState<DeliveryFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchFailures = async () => {
    try {
      // Get failures from the last 4 hours
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('id, title, message, created_at, entity_id')
        .eq('type', 'delivery_failure')
        .gte('created_at', fourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(queryLimitDeliveryFailuresDetail);
      
      if (error) {
        console.error('Error fetching delivery failures:', error);
        return;
      }
      
      setFailures(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFailures();
    
    // Refresh based on config interval
    const interval = setInterval(fetchFailures, intervalDeliveryFailuresMs);
    return () => clearInterval(interval);
  }, [intervalDeliveryFailuresMs]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('delivery-failures')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_notifications',
          filter: 'type=eq.delivery_failure',
        },
        (payload) => {
          setFailures(prev => [payload.new as DeliveryFailure, ...prev].slice(0, realtimeDeliveryFailuresLimit));
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const maskPhone = (message: string): string => {
    // Mask phone numbers in the message for privacy
    return message.replace(/(\d{2})(\d{5})(\d{4})/g, '$1*****$3');
  };

  const count = failures.length;
  
  if (loading) {
    return null;
  }

  // No failures - show success badge
  if (count === 0) {
    return (
      <Alert className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <AlertTitle className="text-green-700 dark:text-green-400">Entregas OK</AlertTitle>
        <AlertDescription className="text-green-600 dark:text-green-300">
          Nenhuma falha de envio nas últimas 4 horas.
        </AlertDescription>
      </Alert>
    );
  }

  const isWarning = count >= 5 && count < 20;
  const isError = count >= 20;

  return (
    <Alert 
      className={cn(
        isError ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" :
        isWarning ? "border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20" :
        "border-orange-200 bg-orange-50/50 dark:bg-orange-950/20"
      )}
    >
      <MessageSquareWarning className={cn(
        "h-4 w-4",
        isError ? "text-red-500" : isWarning ? "text-yellow-500" : "text-orange-500"
      )} />
      <AlertTitle className="flex items-center gap-2">
        <span className={cn(
          isError ? "text-red-700 dark:text-red-400" : 
          isWarning ? "text-yellow-700 dark:text-yellow-400" :
          "text-orange-700 dark:text-orange-400"
        )}>
          Falhas de Envio
        </span>
        <Badge variant={isError ? "destructive" : "secondary"}>
          {count} {count === 1 ? 'falha' : 'falhas'}
        </Badge>
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span className={cn(
          isError ? "text-red-600 dark:text-red-300" : 
          isWarning ? "text-yellow-600 dark:text-yellow-300" :
          "text-orange-600 dark:text-orange-300"
        )}>
          {count} {count === 1 ? 'mensagem não foi entregue' : 'mensagens não foram entregues'} nas últimas 4 horas.
        </span>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="ml-2">
              Ver detalhes
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Falhas de Envio Recentes
              </DialogTitle>
              <DialogDescription>
                Últimas {failures.length} falhas de entrega de mensagens nas últimas 4 horas.
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {failures.map((failure) => (
                  <div 
                    key={failure.id} 
                    className="p-3 border rounded-lg bg-muted/50 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{failure.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(failure.created_at), { 
                          addSuffix: true,
                          locale: ptBR 
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {maskPhone(failure.message)}
                    </p>
                    {failure.entity_id && (
                      <a 
                        href={`/whatsapp?conversa=${failure.entity_id}`}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Ver conversa
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchFailures()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AlertDescription>
    </Alert>
  );
}

import { Volume2, VolumeX, Mic, AlertTriangle, MessageSquare, HelpCircle, Repeat, Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useSofiaAudioSettings } from '@/hooks/useSofiaAudioSettings';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function SofiaAudioConfig() {
  const { 
    settings, 
    loading, 
    updating, 
    toggleEnabled, 
    toggleCongruence, 
    toggleOfferOnDoubts,
    updateMinChars,
    updateMinCharsOffer,
    disabledByFallback, 
    fallbackAt 
  } = useSofiaAudioSettings();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Respostas em Áudio</CardTitle>
        </div>
        <CardDescription>
          Configure quando e como a sofIA envia mensagens de voz via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main toggle */}
        <div className={cn(
          "flex items-center justify-between p-4 rounded-lg border-2 transition-all",
          settings.enabled 
            ? "border-primary/30 bg-primary/5" 
            : disabledByFallback
              ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20"
              : "border-muted bg-muted/30"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              settings.enabled 
                ? "bg-primary/20" 
                : disabledByFallback 
                  ? "bg-amber-100 dark:bg-amber-900/30" 
                  : "bg-muted"
            )}>
              {settings.enabled ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : disabledByFallback ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">Áudio da sofIA</span>
                {loading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <>
                    <Badge 
                      variant={settings.enabled ? "default" : "secondary"}
                      className={cn(
                        settings.enabled ? "bg-primary" : "",
                        disabledByFallback && !settings.enabled ? "bg-amber-500 text-white" : ""
                      )}
                    >
                      {settings.enabled ? 'ATIVO' : 'DESATIVADO'}
                    </Badge>
                    {!settings.enabled && disabledByFallback && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
                        AUTO
                      </Badge>
                    )}
                    {!settings.enabled && !disabledByFallback && (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
                        MANUAL
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {settings.enabled 
                  ? 'A sofIA pode enviar áudios conforme as regras abaixo'
                  : disabledByFallback
                    ? `Desativado automaticamente ${fallbackAt ? formatDistanceToNow(new Date(fallbackAt), { addSuffix: true, locale: ptBR }) : ''} (ElevenLabs sem créditos)`
                    : 'A sofIA responde apenas por texto (desativado manualmente)'
                }
              </p>
            </div>
          </div>
          
          {loading ? (
            <Skeleton className="h-6 w-11" />
          ) : (
            <Switch
              checked={settings.enabled}
              onCheckedChange={toggleEnabled}
              disabled={updating}
              className="data-[state=checked]:bg-primary"
            />
          )}
        </div>

        {/* Audio Rules */}
        {settings.enabled && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Settings2 className="h-4 w-4" />
                Regras de Disparo de Áudio
              </div>

              {/* Congruence Rule */}
              <div className={cn(
                "p-4 rounded-lg border transition-all",
                settings.congruenceEnabled ? "border-green-500/30 bg-green-500/5" : "border-muted bg-muted/20"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-full mt-0.5",
                      settings.congruenceEnabled ? "bg-green-500/20" : "bg-muted"
                    )}>
                      <Repeat className={cn(
                        "h-4 w-4",
                        settings.congruenceEnabled ? "text-green-600" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Regra de Congruência</span>
                        {loading ? (
                          <Skeleton className="h-5 w-12" />
                        ) : (
                          <Badge 
                            variant={settings.congruenceEnabled ? "default" : "secondary"}
                            className={cn("text-xs", settings.congruenceEnabled && "bg-green-500")}
                          >
                            {settings.congruenceEnabled ? 'ON' : 'OFF'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Se o cliente enviar um áudio, a sofIA responde automaticamente com áudio
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                        <MessageSquare className="h-3 w-3" />
                        <span>Resposta imediata sem perguntar preferência</span>
                      </div>
                    </div>
                  </div>
                  
                  {loading ? (
                    <Skeleton className="h-5 w-9" />
                  ) : (
                    <Switch
                      checked={settings.congruenceEnabled}
                      onCheckedChange={toggleCongruence}
                      disabled={updating || !settings.enabled}
                      className="data-[state=checked]:bg-green-500"
                    />
                  )}
                </div>

                {/* Min chars slider - only show when congruence is enabled */}
                {settings.congruenceEnabled && (
                  <div className="mt-4 pt-4 border-t border-dashed space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-muted-foreground">
                        Mínimo de caracteres na transcrição
                      </Label>
                      <span className="text-sm font-mono font-medium">
                        {settings.minCharsForCongruence} chars
                      </span>
                    </div>
                    <Slider
                      value={[settings.minCharsForCongruence]}
                      onValueCommit={(value) => updateMinChars(value[0])}
                      min={20}
                      max={200}
                      step={10}
                      disabled={updating}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Áudios com transcrição menor que {settings.minCharsForCongruence} caracteres serão respondidos por texto
                    </p>
                  </div>
                )}
              </div>

              {/* Offer on Doubts Rule */}
              <div className={cn(
                "p-4 rounded-lg border transition-all",
                settings.offerOnDoubtsEnabled ? "border-blue-500/30 bg-blue-500/5" : "border-muted bg-muted/20"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-full mt-0.5",
                      settings.offerOnDoubtsEnabled ? "bg-blue-500/20" : "bg-muted"
                    )}>
                      <HelpCircle className={cn(
                        "h-4 w-4",
                        settings.offerOnDoubtsEnabled ? "text-blue-600" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Oferecer Áudio para Dúvidas</span>
                        {loading ? (
                          <Skeleton className="h-5 w-12" />
                        ) : (
                          <Badge 
                            variant={settings.offerOnDoubtsEnabled ? "default" : "secondary"}
                            className={cn("text-xs", settings.offerOnDoubtsEnabled && "bg-blue-500")}
                          >
                            {settings.offerOnDoubtsEnabled ? 'ON' : 'OFF'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Quando o cliente demonstrar confusão ou ter muitas dúvidas, a sofIA oferece enviar um áudio explicativo
                      </p>
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground italic">
                        "Você prefere que eu te envie um áudio explicando tudo? Assim fica mais fácil de entender!"
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {['estou confuso', 'não entendi', 'muitas dúvidas', 'me explica'].map((phrase) => (
                          <Badge key={phrase} variant="outline" className="text-xs font-normal">
                            "{phrase}"
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {loading ? (
                    <Skeleton className="h-5 w-9" />
                  ) : (
                    <Switch
                      checked={settings.offerOnDoubtsEnabled}
                      onCheckedChange={toggleOfferOnDoubts}
                      disabled={updating || !settings.enabled}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  )}
                </div>

                {/* Min chars for audio offer - only show when offer on doubts is enabled */}
                {settings.offerOnDoubtsEnabled && (
                  <div className="mt-4 pt-4 border-t border-dashed space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-muted-foreground">
                        Limite de caracteres para oferecer áudio
                      </Label>
                      <span className="text-sm font-mono font-medium">
                        {settings.minCharsForAudioOffer} chars
                      </span>
                    </div>
                    <Slider
                      value={[settings.minCharsForAudioOffer]}
                      onValueCommit={(value) => updateMinCharsOffer(value[0])}
                      min={100}
                      max={500}
                      step={25}
                      disabled={updating}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Respostas com mais de {settings.minCharsForAudioOffer} caracteres terão oferta de áudio
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <div className="text-sm text-muted-foreground space-y-2 p-3 bg-muted/30 rounded-lg">
          <p className="font-medium text-foreground">Como funciona:</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li>A sofIA usa ElevenLabs para gerar áudios com voz personalizada</li>
            <li>Áudios são enviados via Z-API com waveform (parece voz natural)</li>
            <li>A preferência por áudio é salva por conversa</li>
            <li>Se ElevenLabs ficar sem créditos, o sistema desativa automaticamente</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

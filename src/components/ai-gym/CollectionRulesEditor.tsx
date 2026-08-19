import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle } from 'lucide-react';

interface CollectionRulesEditorProps {
  rules: {
    stages?: Array<{
      day: number;
      stage: string;
      tone: string;
      action: string;
    }>;
    exceptions?: Record<string, string>;
  } | null;
  onChange: (rules: any) => void;
}

export function CollectionRulesEditor({ rules, onChange }: CollectionRulesEditorProps) {
  const stages = rules?.stages || [];
  const exceptions = rules?.exceptions || {};

  const getToneColor = (tone: string) => {
    const colors: Record<string, string> = {
      gentil: 'bg-green-500/10 text-green-600',
      objetivo: 'bg-blue-500/10 text-blue-600',
      firme_educado: 'bg-yellow-500/10 text-yellow-600',
      firme: 'bg-orange-500/10 text-orange-600',
      formal: 'bg-red-500/10 text-red-600'
    };
    return colors[tone] || 'bg-muted text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-orange-500" />
          Régua de Cobrança
        </CardTitle>
        <CardDescription>
          Configure a progressão de mensagens conforme os dias de atraso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timeline */}
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-4">
            {stages.map((stage, idx) => (
              <div key={idx} className="relative pl-10">
                <div className={`absolute left-2 w-5 h-5 rounded-full border-2 bg-background flex items-center justify-center
                  ${stage.day < 0 ? 'border-green-500' : stage.day <= 5 ? 'border-yellow-500' : 'border-orange-500'}`}
                >
                  <span className="text-[10px] font-bold">
                    {stage.day > 0 ? `+${stage.day}` : stage.day}
                  </span>
                </div>
                <div className="border rounded-lg p-3 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">D{stage.day > 0 ? `+${stage.day}` : stage.day}</Badge>
                      <span className="font-medium">{stage.stage.replace(/_/g, ' ')}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getToneColor(stage.tone)}`}>
                      Tom: {stage.tone}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{stage.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exceptions */}
        <div>
          <h4 className="font-medium flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Exceções e Tratamentos Especiais
          </h4>
          <div className="space-y-2">
            {Object.entries(exceptions).map(([key, value]) => (
              <div key={key} className="flex items-start gap-3 p-3 border rounded-lg bg-yellow-500/5">
                <Badge variant="outline" className="shrink-0">
                  {key.replace(/_/g, ' ')}
                </Badge>
                <p className="text-sm text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

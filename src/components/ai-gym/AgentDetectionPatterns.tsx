import { useState, useEffect, useMemo, useRef } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Tag, 
  Regex, 
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Check,
  X,
  Copy,
  FileText,
  Filter,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DetectionPattern {
  id: string;
  category: string;
  pattern: string;
  pattern_type: 'keyword' | 'regex';
  description: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryGroup {
  category: string;
  patterns: DetectionPattern[];
  activeCount: number;
  totalCount: number;
}

// Predefined categories with descriptions
const CATEGORY_DEFINITIONS: Record<string, { label: string; description: string; color: string }> = {
  // Existing categories
  audio_accept: { label: 'Aceita Áudio', description: 'Padrões que indicam aceitação de áudio', color: 'bg-green-500/10 text-green-600' },
  audio_reject: { label: 'Rejeita Áudio', description: 'Padrões que indicam rejeição de áudio', color: 'bg-red-500/10 text-red-600' },
  discount_objection: { label: 'Objeção Desconto', description: 'Padrões de objeção relacionada a desconto', color: 'bg-yellow-500/10 text-yellow-600' },
  hesitation_moderate: { label: 'Hesitação Moderada', description: 'Sinais de hesitação leve', color: 'bg-orange-500/10 text-orange-600' },
  hesitation_strong: { label: 'Hesitação Forte', description: 'Sinais de hesitação forte', color: 'bg-red-500/10 text-red-600' },
  negative_feedback: { label: 'Feedback Negativo', description: 'Padrões de feedback negativo', color: 'bg-red-500/10 text-red-600' },
  neutral_feedback: { label: 'Feedback Neutro', description: 'Padrões de feedback neutro', color: 'bg-gray-500/10 text-gray-600' },
  positive_feedback: { label: 'Feedback Positivo', description: 'Padrões de feedback positivo', color: 'bg-green-500/10 text-green-600' },
  // New categories for migration
  existing_client: { label: 'Cliente Existente', description: 'Detecta se já é cliente COESA', color: 'bg-blue-500/10 text-blue-600' },
  confirm_existing: { label: 'Confirma Existente', description: 'Confirmação de cliente existente', color: 'bg-blue-500/10 text-blue-600' },
  confirm_new: { label: 'Confirma Novo', description: 'Confirmação de cliente novo', color: 'bg-emerald-500/10 text-emerald-600' },
  select_financial: { label: 'Financeiro', description: 'Triagem para departamento financeiro', color: 'bg-purple-500/10 text-purple-600' },
  select_pos_venda: { label: 'Pós-Venda', description: 'Triagem para pós-venda', color: 'bg-indigo-500/10 text-indigo-600' },
  complex_topic: { label: 'Tópico Complexo', description: 'Assuntos que requerem escalação', color: 'bg-amber-500/10 text-amber-600' },
  multiple_questions: { label: 'Múltiplas Perguntas', description: 'Detecta mensagens com várias perguntas', color: 'bg-cyan-500/10 text-cyan-600' },
  document_complaint: { label: 'Reclamação Documento', description: 'Reclamações sobre envio de documentos', color: 'bg-rose-500/10 text-rose-600' },
  broken_link: { label: 'Link Quebrado', description: 'Relatos de links não funcionando', color: 'bg-red-500/10 text-red-600' },
  high_intent: { label: 'Alta Intenção', description: 'Sinais de alta intenção de compra', color: 'bg-green-500/10 text-green-600' },
  greeting: { label: 'Saudação', description: 'Cumprimentos e saudações', color: 'bg-sky-500/10 text-sky-600' },
  goodbye: { label: 'Despedida', description: 'Padrões de encerramento', color: 'bg-slate-500/10 text-slate-600' },
};

interface AgentDetectionPatternsProps {
  agentId: string;
  agentName?: string;
}

export function AgentDetectionPatterns({ agentId, agentName = 'Agente' }: AgentDetectionPatternsProps) {
  const { importPreviewLimit } = useUIConfig();
  const [patterns, setPatterns] = useState<DetectionPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingPattern, setEditingPattern] = useState<DetectionPattern | null>(null);
  const [patternToDelete, setPatternToDelete] = useState<DetectionPattern | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('csv');
  const [csvCategory, setCsvCategory] = useState('');
  const [csvPatternType, setCsvPatternType] = useState<'keyword' | 'regex'>('keyword');
  const [isImporting, setIsImporting] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [matchedPatterns, setMatchedPatterns] = useState<DetectionPattern[]>([]);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  
  // New pattern form state
  const [newPattern, setNewPattern] = useState({
    category: '',
    pattern: '',
    pattern_type: 'keyword' as 'keyword' | 'regex',
    description: '',
    priority: 0,
    is_active: true
  });
  
  const { toast } = useToast();

  useEffect(() => {
    fetchPatterns();
  }, []);

  const fetchPatterns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sofia_detection_patterns')
        .select('*')
        .order('category')
        .order('priority', { ascending: false })
        .order('pattern');

      if (error) throw error;
      setPatterns((data || []).map(p => ({
        ...p,
        pattern_type: p.pattern_type as 'keyword' | 'regex'
      })));
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar padrões',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Group patterns by category
  const groupedPatterns = useMemo(() => {
    const groups: Record<string, CategoryGroup> = {};
    
    patterns.forEach(pattern => {
      if (!groups[pattern.category]) {
        groups[pattern.category] = {
          category: pattern.category,
          patterns: [],
          activeCount: 0,
          totalCount: 0
        };
      }
      groups[pattern.category].patterns.push(pattern);
      groups[pattern.category].totalCount++;
      if (pattern.is_active) {
        groups[pattern.category].activeCount++;
      }
    });

    return Object.values(groups).sort((a, b) => a.category.localeCompare(b.category));
  }, [patterns]);

  // Filter patterns
  const filteredGroups = useMemo(() => {
    return groupedPatterns
      .filter(group => selectedCategory === 'all' || group.category === selectedCategory)
      .map(group => ({
        ...group,
        patterns: group.patterns.filter(p => 
          searchQuery === '' || 
          p.pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }))
      .filter(group => group.patterns.length > 0);
  }, [groupedPatterns, selectedCategory, searchQuery]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(patterns.map(p => p.category));
    return Array.from(cats).sort();
  }, [patterns]);

  // Test pattern matching
  const handleTestInput = (input: string) => {
    setTestInput(input);
    if (!input.trim()) {
      setMatchedPatterns([]);
      return;
    }

    const inputLower = input.toLowerCase();
    const matched = patterns.filter(p => {
      if (!p.is_active) return false;
      
      if (p.pattern_type === 'keyword') {
        return inputLower.includes(p.pattern.toLowerCase());
      } else {
        try {
          const regex = new RegExp(p.pattern, 'i');
          return regex.test(input);
        } catch {
          return false;
        }
      }
    });

    setMatchedPatterns(matched);
  };

  const handleSavePattern = async (pattern: Partial<DetectionPattern>, isNew: boolean) => {
    try {
      if (isNew) {
        const { data, error } = await supabase
          .from('sofia_detection_patterns')
          .insert({
            category: pattern.category,
            pattern: pattern.pattern,
            pattern_type: pattern.pattern_type || 'keyword',
            description: pattern.description,
            priority: pattern.priority || 0,
            is_active: pattern.is_active ?? true
          })
          .select()
          .single();

        if (error) throw error;
        setPatterns(prev => [...prev, {
          ...data,
          pattern_type: data.pattern_type as 'keyword' | 'regex'
        }]);
        toast({ title: 'Padrão criado com sucesso' });
      } else {
        const { error } = await supabase
          .from('sofia_detection_patterns')
          .update({
            category: pattern.category,
            pattern: pattern.pattern,
            pattern_type: pattern.pattern_type,
            description: pattern.description,
            priority: pattern.priority,
            is_active: pattern.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', pattern.id);

        if (error) throw error;
        setPatterns(prev => prev.map(p => p.id === pattern.id ? { ...p, ...pattern } as DetectionPattern : p));
        toast({ title: 'Padrão atualizado com sucesso' });
      }

      setIsAddDialogOpen(false);
      setEditingPattern(null);
      setNewPattern({
        category: '',
        pattern: '',
        pattern_type: 'keyword',
        description: '',
        priority: 0,
        is_active: true
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar padrão',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleDeletePattern = async () => {
    if (!patternToDelete) return;

    try {
      const { error } = await supabase
        .from('sofia_detection_patterns')
        .delete()
        .eq('id', patternToDelete.id);

      if (error) throw error;
      setPatterns(prev => prev.filter(p => p.id !== patternToDelete.id));
      toast({ title: 'Padrão excluído com sucesso' });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir padrão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setPatternToDelete(null);
    }
  };

  const handleToggleActive = async (pattern: DetectionPattern) => {
    try {
      const { error } = await supabase
        .from('sofia_detection_patterns')
        .update({ 
          is_active: !pattern.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', pattern.id);

      if (error) throw error;
      setPatterns(prev => prev.map(p => 
        p.id === pattern.id ? { ...p, is_active: !p.is_active } : p
      ));
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar padrão',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleToggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const handleExportJSON = () => {
    const exportData = patterns.map(p => ({
      category: p.category,
      pattern: p.pattern,
      pattern_type: p.pattern_type,
      description: p.description,
      priority: p.priority,
      is_active: p.is_active
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentId}-detection-patterns.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Padrões exportados em JSON' });
  };

  const handleExportCSV = () => {
    // CSV header
    const headers = ['category', 'pattern', 'pattern_type', 'description', 'priority', 'is_active'];
    
    // Escape CSV values (handle quotes and commas)
    const escapeCSV = (value: string | number | boolean | null): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV rows
    const rows = patterns.map(p => [
      escapeCSV(p.category),
      escapeCSV(p.pattern),
      escapeCSV(p.pattern_type),
      escapeCSV(p.description),
      escapeCSV(p.priority),
      escapeCSV(p.is_active)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentId}-detection-patterns.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Padrões exportados em CSV' });
  };

  const parseCSV = (csvText: string): string[] => {
    // Parse CSV, handling quoted values and different line endings
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    const patterns: string[] = [];
    
    for (const line of lines) {
      // Skip header rows
      const lowerLine = line.toLowerCase().trim();
      if (lowerLine.startsWith('pattern') || lowerLine.startsWith('keyword') || 
          lowerLine.startsWith('categoria') || lowerLine.startsWith('padrão') ||
          lowerLine.startsWith('#')) {
        continue;
      }
      
      // Handle CSV with multiple columns - take first column
      let value = line;
      if (line.includes(',') || line.includes(';')) {
        // Try to parse as CSV
        const delimiter = line.includes(';') ? ';' : ',';
        const parts = line.split(delimiter);
        value = parts[0];
      }
      
      // Remove quotes if present
      value = value.trim().replace(/^["']|["']$/g, '');
      
      if (value) {
        patterns.push(value);
      }
    }
    
    return patterns;
  };

  const handleCSVFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setImportText(text);
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      
      let patternsToImport: Array<{
        category: string;
        pattern: string;
        pattern_type: 'keyword' | 'regex';
        description: string | null;
        priority: number;
        is_active: boolean;
      }> = [];

      if (importFormat === 'json') {
        const importData = JSON.parse(importText);
        if (!Array.isArray(importData)) {
          throw new Error('Formato inválido: deve ser um array de padrões');
        }
        
        patternsToImport = importData
          .filter(p => p.category && p.pattern)
          .map(p => ({
            category: p.category,
            pattern: p.pattern,
            pattern_type: (p.pattern_type || 'keyword') as 'keyword' | 'regex',
            description: p.description || null,
            priority: p.priority || 0,
            is_active: p.is_active ?? true
          }));
      } else {
        // CSV format - simpler, one pattern per line
        if (!csvCategory) {
          throw new Error('Selecione uma categoria para os padrões');
        }
        
        const parsedPatterns = parseCSV(importText);
        
        if (parsedPatterns.length === 0) {
          throw new Error('Nenhum padrão válido encontrado no CSV');
        }
        
        // Check for duplicates with existing patterns
        const existingInCategory = patterns
          .filter(p => p.category === csvCategory)
          .map(p => p.pattern.toLowerCase());
        
        const uniquePatterns = parsedPatterns.filter(
          p => !existingInCategory.includes(p.toLowerCase())
        );
        
        const duplicateCount = parsedPatterns.length - uniquePatterns.length;
        
        patternsToImport = uniquePatterns.map(pattern => ({
          category: csvCategory,
          pattern: pattern,
          pattern_type: csvPatternType,
          description: null,
          priority: 0,
          is_active: true
        }));
        
        if (duplicateCount > 0) {
          toast({
            title: 'Duplicatas ignoradas',
            description: `${duplicateCount} padrão(ões) já existente(s) foram ignorados`,
          });
        }
      }
      
      if (patternsToImport.length === 0) {
        throw new Error('Nenhum padrão novo para importar');
      }

      // Insert in batches of 100 to avoid timeouts
      const batchSize = 100;
      let totalImported = 0;
      
      for (let i = 0; i < patternsToImport.length; i += batchSize) {
        const batch = patternsToImport.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('sofia_detection_patterns')
          .insert(batch)
          .select();

        if (error) throw error;
        
        if (data) {
          setPatterns(prev => [...prev, ...data.map(p => ({
            ...p,
            pattern_type: p.pattern_type as 'keyword' | 'regex'
          }))]);
          totalImported += data.length;
        }
      }

      setIsImportDialogOpen(false);
      setImportText('');
      setCsvCategory('');
      toast({ 
        title: 'Importação concluída',
        description: `${totalImported} padrões importados com sucesso`
      });
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleBulkToggleCategory = async (category: string, setActive: boolean) => {
    try {
      const categoryPatterns = patterns.filter(p => p.category === category);
      const ids = categoryPatterns.map(p => p.id);

      const { error } = await supabase
        .from('sofia_detection_patterns')
        .update({ 
          is_active: setActive,
          updated_at: new Date().toISOString()
        })
        .in('id', ids);

      if (error) throw error;

      setPatterns(prev => prev.map(p => 
        p.category === category ? { ...p, is_active: setActive } : p
      ));

      toast({ 
        title: setActive ? 'Categoria ativada' : 'Categoria desativada',
        description: `${ids.length} padrões atualizados`
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar categoria',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORY_DEFINITIONS[category] || {
      label: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: 'Categoria personalizada',
      color: 'bg-muted text-muted-foreground'
    };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Detection Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Detection Patterns
              </CardTitle>
              <CardDescription>
                {patterns.length} padrões em {categories.length} categorias • 
                {patterns.filter(p => p.is_active).length} ativos
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportJSON}>
                  <FileText className="h-4 w-4 mr-1" />
                  JSON
                </Button>
              </div>
              <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
                setIsImportDialogOpen(open);
                if (!open) {
                  setImportText('');
                  setCsvCategory('');
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-1" />
                    Importar
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Importar Padrões em Massa</DialogTitle>
                    <DialogDescription>
                      Importe múltiplos padrões de uma vez via CSV ou JSON
                    </DialogDescription>
                  </DialogHeader>
                  
                  {/* Format Selector */}
                  <div className="flex gap-2 p-1 bg-muted rounded-lg">
                    <Button
                      variant={importFormat === 'csv' ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setImportFormat('csv')}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      CSV (Simples)
                    </Button>
                    <Button
                      variant={importFormat === 'json' ? 'default' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setImportFormat('json')}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      JSON (Completo)
                    </Button>
                  </div>

                  {importFormat === 'csv' ? (
                    <div className="space-y-4">
                      {/* CSV Category and Type Selection */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Categoria *</Label>
                          <Select value={csvCategory} onValueChange={setCsvCategory}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a categoria" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(CATEGORY_DEFINITIONS).map(([key, info]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs ${info.color}`}>
                                      {info.label}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo de Padrão</Label>
                          <Select value={csvPatternType} onValueChange={(v: 'keyword' | 'regex') => setCsvPatternType(v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="keyword">
                                <span className="flex items-center gap-2">
                                  <Tag className="h-4 w-4" />
                                  Keyword
                                </span>
                              </SelectItem>
                              <SelectItem value="regex">
                                <span className="flex items-center gap-2">
                                  <Regex className="h-4 w-4" />
                                  Regex
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* CSV Upload */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Padrões (um por linha)</Label>
                          <div>
                            <input
                              ref={csvFileInputRef}
                              type="file"
                              accept=".csv,.txt"
                              onChange={handleCSVFileUpload}
                              className="hidden"
                            />
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => csvFileInputRef.current?.click()}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload CSV
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={`já sou cliente
quero saber do meu contrato
número do meu pedido
fatura em atraso
renovar contrato`}
                          className="min-h-[200px] font-mono text-sm"
                        />
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          <Info className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium">Formato CSV:</p>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              <li>Um padrão por linha</li>
                              <li>Linhas começando com # são ignoradas</li>
                              <li>Duplicatas existentes são automaticamente ignoradas</li>
                              <li>Suporta arquivos .csv ou .txt</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Preview */}
                      {importText && csvCategory && (
                        <div className="p-3 border rounded-lg bg-muted/30">
                          <p className="text-sm font-medium mb-2">Preview:</p>
                          <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                            {parseCSV(importText).slice(0, importPreviewLimit).map((p, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {p}
                              </Badge>
                            ))}
                            {parseCSV(importText).length > importPreviewLimit && (
                              <Badge variant="outline" className="text-xs">
                                +{parseCSV(importText).length - importPreviewLimit} mais
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {parseCSV(importText).length} padrões serão importados para "{getCategoryInfo(csvCategory).label}"
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>JSON de Padrões</Label>
                      <Textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder={`[
  {"category": "existing_client", "pattern": "já sou cliente", "pattern_type": "keyword"},
  {"category": "high_intent", "pattern": "quero contratar", "pattern_type": "keyword", "priority": 10}
]`}
                        className="min-h-[250px] font-mono text-sm"
                      />
                      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">Formato JSON:</p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5">
                            <li>Array de objetos com category e pattern obrigatórios</li>
                            <li>pattern_type: "keyword" ou "regex" (default: keyword)</li>
                            <li>Campos opcionais: description, priority, is_active</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleImport} 
                      disabled={!importText.trim() || (importFormat === 'csv' && !csvCategory) || isImporting}
                    >
                      {isImporting ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1" />
                          Importar {importFormat === 'csv' && importText ? `(${parseCSV(importText).length})` : ''}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingPattern ? 'Editar Padrão' : 'Novo Padrão'}
                    </DialogTitle>
                    <DialogDescription>
                      Configure o padrão de detecção
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select
                        value={editingPattern?.category || newPattern.category}
                        onValueChange={(v) => editingPattern 
                          ? setEditingPattern({ ...editingPattern, category: v })
                          : setNewPattern({ ...newPattern, category: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORY_DEFINITIONS).map(([key, info]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${info.color}`}>
                                  {info.label}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                          {categories.filter(c => !CATEGORY_DEFINITIONS[c]).map(cat => (
                            <SelectItem key={cat} value={cat}>
                              {cat.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Ou digite uma nova categoria"
                        value={editingPattern?.category || newPattern.category}
                        onChange={(e) => editingPattern
                          ? setEditingPattern({ ...editingPattern, category: e.target.value })
                          : setNewPattern({ ...newPattern, category: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select
                        value={editingPattern?.pattern_type || newPattern.pattern_type}
                        onValueChange={(v: 'keyword' | 'regex') => editingPattern
                          ? setEditingPattern({ ...editingPattern, pattern_type: v })
                          : setNewPattern({ ...newPattern, pattern_type: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keyword">
                            <span className="flex items-center gap-2">
                              <Tag className="h-4 w-4" />
                              Keyword
                            </span>
                          </SelectItem>
                          <SelectItem value="regex">
                            <span className="flex items-center gap-2">
                              <Regex className="h-4 w-4" />
                              Regex
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Padrão</Label>
                      <Input
                        value={editingPattern?.pattern || newPattern.pattern}
                        onChange={(e) => editingPattern
                          ? setEditingPattern({ ...editingPattern, pattern: e.target.value })
                          : setNewPattern({ ...newPattern, pattern: e.target.value })
                        }
                        placeholder={newPattern.pattern_type === 'regex' ? '^olá.*mundo$' : 'palavra chave'}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Descrição (opcional)</Label>
                      <Input
                        value={editingPattern?.description || newPattern.description}
                        onChange={(e) => editingPattern
                          ? setEditingPattern({ ...editingPattern, description: e.target.value })
                          : setNewPattern({ ...newPattern, description: e.target.value })
                        }
                        placeholder="Descrição do padrão"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Prioridade</Label>
                      <Input
                        type="number"
                        value={editingPattern?.priority || newPattern.priority}
                        onChange={(e) => editingPattern
                          ? setEditingPattern({ ...editingPattern, priority: parseInt(e.target.value) || 0 })
                          : setNewPattern({ ...newPattern, priority: parseInt(e.target.value) || 0 })
                        }
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground">
                        Padrões com maior prioridade são verificados primeiro
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editingPattern?.is_active ?? newPattern.is_active}
                        onCheckedChange={(checked) => editingPattern
                          ? setEditingPattern({ ...editingPattern, is_active: checked })
                          : setNewPattern({ ...newPattern, is_active: checked })
                        }
                      />
                      <Label>Ativo</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setIsAddDialogOpen(false);
                      setEditingPattern(null);
                    }}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={() => handleSavePattern(
                        editingPattern || newPattern,
                        !editingPattern
                      )}
                      disabled={!(editingPattern?.pattern || newPattern.pattern) || 
                               !(editingPattern?.category || newPattern.category)}
                    >
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar padrões..."
                className="pl-9"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map(cat => {
                  const info = getCategoryInfo(cat);
                  return (
                    <SelectItem key={cat} value={cat}>
                      {info.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Test Input */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <Label className="text-sm font-medium">Testar Detecção</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={testInput}
                onChange={(e) => handleTestInput(e.target.value)}
                placeholder="Digite uma mensagem para testar os padrões..."
                className="flex-1"
              />
              {testInput && (
                <Button variant="ghost" size="icon" onClick={() => handleTestInput('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {matchedPatterns.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-sm text-muted-foreground">
                  {matchedPatterns.length} padrão(ões) detectado(s):
                </p>
                <div className="flex flex-wrap gap-2">
                  {matchedPatterns.map(p => {
                    const info = getCategoryInfo(p.category);
                    return (
                      <Badge key={p.id} variant="outline" className={info.color}>
                        {info.label}: {p.pattern}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            {testInput && matchedPatterns.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Nenhum padrão detectado
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Patterns by Category */}
      <div className="space-y-2">
        {filteredGroups.map(group => {
          const info = getCategoryInfo(group.category);
          const isExpanded = expandedCategories.has(group.category);

          return (
            <Collapsible 
              key={group.category} 
              open={isExpanded}
              onOpenChange={() => handleToggleCategoryExpand(group.category)}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge variant="outline" className={info.color}>
                          {info.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {group.activeCount}/{group.totalCount} ativos
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBulkToggleCategory(group.category, true)}
                          disabled={group.activeCount === group.totalCount}
                        >
                          <ToggleRight className="h-4 w-4 mr-1" />
                          Ativar todos
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBulkToggleCategory(group.category, false)}
                          disabled={group.activeCount === 0}
                        >
                          <ToggleLeft className="h-4 w-4 mr-1" />
                          Desativar todos
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="ml-7">
                      {info.description}
                    </CardDescription>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ScrollArea className="max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">Tipo</TableHead>
                            <TableHead>Padrão</TableHead>
                            <TableHead className="hidden md:table-cell">Descrição</TableHead>
                            <TableHead className="w-[80px]">Prioridade</TableHead>
                            <TableHead className="w-[80px]">Ativo</TableHead>
                            <TableHead className="w-[100px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.patterns.map(pattern => (
                            <TableRow key={pattern.id} className={!pattern.is_active ? 'opacity-50' : ''}>
                              <TableCell>
                                {pattern.pattern_type === 'regex' ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Regex className="h-3 w-3" />
                                    Regex
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1">
                                    <Tag className="h-3 w-3" />
                                    Key
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {pattern.pattern}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                                {pattern.description || '-'}
                              </TableCell>
                              <TableCell className="text-center">
                                {pattern.priority}
                              </TableCell>
                              <TableCell>
                                <Switch
                                  checked={pattern.is_active}
                                  onCheckedChange={() => handleToggleActive(pattern)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setEditingPattern(pattern);
                                      setIsAddDialogOpen(true);
                                    }}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => setPatternToDelete(pattern)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}

        {filteredGroups.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'Nenhum padrão encontrado para esta busca' : 'Nenhum padrão cadastrado'}
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Padrão
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!patternToDelete} onOpenChange={() => setPatternToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O padrão "{patternToDelete?.pattern}" será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePattern}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { useCronogramaGD2 } from "@/hooks/useCronogramaGD2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Calendar, Percent, RefreshCw, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function CronogramaGD2Manager() {
  const { cronograma, loading, refresh, updateItem, addItem, deleteItem } = useCronogramaGD2();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPercentual, setEditPercentual] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newAno, setNewAno] = useState("");
  const [newPercentual, setNewPercentual] = useState("");
  const [newDescricao, setNewDescricao] = useState("");

  const currentYear = new Date().getFullYear();

  const handleEdit = (id: string, percentual: number, descricao: string | null) => {
    setEditingId(id);
    setEditPercentual((percentual * 100).toString());
    setEditDescricao(descricao || "");
  };

  const handleSave = async (id: string) => {
    const percentual = parseFloat(editPercentual) / 100;
    if (isNaN(percentual) || percentual < 0 || percentual > 1) {
      toast.error("Percentual deve estar entre 0% e 100%");
      return;
    }

    const success = await updateItem(id, percentual, editDescricao || undefined);
    if (success) {
      toast.success("Cronograma atualizado!");
      setEditingId(null);
    } else {
      toast.error("Erro ao atualizar");
    }
  };

  const handleAdd = async () => {
    const ano = parseInt(newAno);
    const percentual = parseFloat(newPercentual) / 100;

    if (isNaN(ano) || ano < 2020 || ano > 2050) {
      toast.error("Ano inválido");
      return;
    }
    if (isNaN(percentual) || percentual < 0 || percentual > 1) {
      toast.error("Percentual deve estar entre 0% e 100%");
      return;
    }

    const success = await addItem(ano, percentual, newDescricao || undefined);
    if (success) {
      toast.success("Ano adicionado ao cronograma!");
      setIsAddOpen(false);
      setNewAno("");
      setNewPercentual("");
      setNewDescricao("");
    } else {
      toast.error("Erro ao adicionar. Verifique se o ano já existe.");
    }
  };

  const handleDelete = async (id: string, ano: number) => {
    if (!confirm(`Excluir o ano ${ano} do cronograma?`)) return;
    
    const success = await deleteItem(id);
    if (success) {
      toast.success("Ano removido do cronograma");
    } else {
      toast.error("Erro ao excluir");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Cronograma GD2 (Lei 14.300)
            </CardTitle>
            <CardDescription>
              Percentuais de cobrança da TUSD Fio B por ano de conexão
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Ano
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Ano ao Cronograma</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input
                      type="number"
                      placeholder="2030"
                      value={newAno}
                      onChange={(e) => setNewAno(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Percentual (%)</Label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={newPercentual}
                      onChange={(e) => setNewPercentual(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input
                      placeholder="Ex: 100% da TUSD Fio B"
                      value={newDescricao}
                      onChange={(e) => setNewDescricao(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleAdd} className="w-full">
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Ano</TableHead>
                <TableHead className="w-32">
                  <div className="flex items-center gap-1">
                    Percentual
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Percentual da TUSD Fio B cobrado de acordo com a Lei 14.300.
                            Projetos conectados antes de 2023 mantêm isenção total.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : cronograma.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum item no cronograma
                  </TableCell>
                </TableRow>
              ) : (
                cronograma.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.ano}
                      {item.ano === currentYear && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Atual
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            className="w-20 h-8"
                            value={editPercentual}
                            onChange={(e) => setEditPercentual(e.target.value)}
                          />
                          <Percent className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{(item.percentual * 100).toFixed(0)}%</span>
                          {item.percentual === 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Isento
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === item.id ? (
                        <Input
                          className="h-8"
                          value={editDescricao}
                          onChange={(e) => setEditDescricao(e.target.value)}
                          placeholder="Descrição..."
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {item.descricao || "-"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === item.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSave(item.id)}
                          >
                            Salvar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEdit(item.id, item.percentual, item.descricao)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(item.id, item.ano)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        <p className="text-xs text-muted-foreground mt-4">
          <strong>Lei 14.300/2022:</strong> Define a transição gradual da cobrança sobre a TUSD Fio B 
          para projetos de geração distribuída conectados a partir de 2023.
        </p>
      </CardContent>
    </Card>
  );
}

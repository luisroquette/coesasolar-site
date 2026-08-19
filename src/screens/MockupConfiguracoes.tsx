import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Menu, Sun, Bell, Zap, DollarSign,
  Plus, Trash2, GripVertical, RotateCcw, Save,
  LayoutDashboard, FileText, Factory, Shield,
  CheckCircle2, Search, X, Sparkles,
  Eye, HelpCircle
} from "lucide-react";
import coesaGreen from "@/assets/logos/coesa-green.png";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: FileText, label: "Relatórios", active: false },
  { icon: Factory, label: "Usinas", active: false },
  { icon: Shield, label: "Admin", active: false },
  { icon: Settings, label: "Configurações", active: true },
];

interface Campo {
  id: string;
  nome: string;
  enabled: boolean;
  required: boolean;
}

const MockupConfiguracoes = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"campos" | "geral" | "notificacoes">("campos");
  const [saved, setSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [camposEnergia, setCamposEnergia] = useState<Campo[]>([
    { id: "1", nome: "Energia Gerada (kWh)", enabled: true, required: true },
    { id: "2", nome: "Energia Injetada (kWh)", enabled: true, required: true },
    { id: "3", nome: "Energia Compensada (kWh)", enabled: true, required: false },
  ]);
  const [camposOpex, setCamposOpex] = useState<Campo[]>([
    { id: "4", nome: "Fatura de energia da Usina", enabled: true, required: true },
    { id: "5", nome: "Segurança Patrimonial", enabled: true, required: false },
    { id: "6", nome: "O&M", enabled: true, required: false },
  ]);

  const [autoSave, setAutoSave] = useState(true);
  const [showHints, setShowHints] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const handleDelete = (id: string, list: Campo[], setList: (c: Campo[]) => void) => {
    setDeletingId(id);
    setTimeout(() => {
      setList(list.filter((c) => c.id !== id));
      setDeletingId(null);
    }, 300);
  };

  const tabs = [
    { key: "campos" as const, label: "Campos", icon: FileText },
    { key: "geral" as const, label: "Geral", icon: Settings },
    { key: "notificacoes" as const, label: "Notificações", icon: Bell },
  ];

  const Toggle = ({ on, onToggle, size = "md" }: { on: boolean; onToggle: () => void; size?: "sm" | "md" }) => {
    const w = size === "sm" ? "w-10" : "w-12";
    const h = size === "sm" ? "h-[22px]" : "h-7";
    const dot = size === "sm" ? "h-[18px] w-[18px]" : "h-[23px] w-[23px]";
    const translate = size === "sm" ? "translate-x-[18px]" : "translate-x-[21px]";
    return (
      <button
        onClick={onToggle}
        className={`${w} ${h} rounded-full relative transition-colors duration-300 shrink-0 ${on ? "bg-primary" : "bg-white/[0.1]"}`}
        style={on ? { boxShadow: "0 0 12px hsl(var(--primary) / 0.25)" } : {}}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-[2px] left-[2px] ${dot} rounded-full bg-white shadow-md ${on ? translate : "translate-x-0"} transition-transform duration-300`}
        />
      </button>
    );
  };

  const CampoRow = ({ campo, isLast, onToggle, onDelete }: { campo: Campo; isLast: boolean; onToggle: () => void; onDelete: () => void }) => {
    const isDeleting = deletingId === campo.id;
    return (
      <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: isDeleting ? 0 : 1, height: isDeleting ? 0 : "auto", x: isDeleting ? -60 : 0 }} exit={{ opacity: 0, height: 0, x: -60 }} transition={{ duration: 0.25 }}>
        <div className={`flex items-center gap-3 px-4 py-3.5 group ${!isLast ? "border-b border-white/[0.06]" : ""}`}>
          <GripVertical className="h-4 w-4 text-white/[0.15] cursor-grab active:cursor-grabbing shrink-0" />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium transition-colors ${campo.enabled ? "text-foreground" : "text-muted-foreground/50"}`}>{campo.nome}</p>
            {campo.required && <p className="text-[11px] text-primary/60 mt-0.5">Obrigatório</p>}
          </div>
          <Toggle on={campo.enabled} onToggle={onToggle} size="sm" />
          <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} onClick={onDelete} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all">
            <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
          </motion.button>
        </div>
      </motion.div>
    );
  };

  const SettingsGroup = ({ title, icon: Icon, iconBg, campos, setCampos, addLabel }: {
    title: string; icon: typeof Zap; iconBg: string; campos: Campo[]; setCampos: (c: Campo[]) => void; addLabel: string;
  }) => {
    const filtered = searchQuery ? campos.filter((c) => c.nome.toLowerCase().includes(searchQuery.toLowerCase())) : campos;
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        <div className="flex items-center gap-2.5 px-1">
          <div className={`p-1.5 rounded-xl ${iconBg}`}><Icon className="h-3.5 w-3.5" /></div>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">{title}</h3>
          <span className="liquid-glass-pill px-2 py-0.5 text-[10px] text-muted-foreground/40 ml-auto">{filtered.length}</span>
        </div>
        <div className="liquid-glass overflow-hidden">
          <AnimatePresence mode="popLayout">
            {filtered.map((campo, i) => (
              <CampoRow
                key={campo.id}
                campo={campo}
                isLast={i === filtered.length - 1}
                onToggle={() => setCampos(campos.map((c) => c.id === campo.id ? { ...c, enabled: !c.enabled } : c))}
                onDelete={() => handleDelete(campo.id, campos, setCampos)}
              />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="py-8 text-center">
              <Search className="h-5 w-5 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground/40">Nenhum campo encontrado</p>
            </div>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
          onClick={() => setCampos([...campos, { id: Date.now().toString(), nome: "", enabled: true, required: false }])}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl liquid-glass-subtle text-sm font-medium text-primary hover:bg-white/[0.06] transition-all"
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </motion.button>
      </motion.div>
    );
  };

  const SettingRow = ({ icon: Icon, iconBg, label, description, on, onToggle, isLast }: {
    icon: typeof Eye; iconBg: string; label: string; description: string; on: boolean; onToggle: () => void; isLast?: boolean;
  }) => (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${!isLast ? "border-b border-white/[0.06]" : ""}`}>
      <div className={`p-1.5 rounded-xl ${iconBg} shrink-0`}><Icon className="h-4 w-4" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">{description}</p>
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );

  return (
    <div className="min-h-screen flex w-full text-foreground font-sans liquid-glass-bg" style={{ background: "hsl(var(--background))" }}>
      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside className={`hidden md:flex flex-col transition-all duration-300 liquid-glass-sidebar ${sidebarOpen ? "w-64" : "w-16"}`}>
        <div className="p-4 border-b border-white/[0.06]">
          <img src={coesaGreen} alt="COESA" className={`transition-all duration-300 ${sidebarOpen ? "h-8" : "h-6 mx-auto"}`} />
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {sidebarItems.map((item) => (
            <motion.button
              key={item.label}
              whileHover={{ x: 4 }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                item.active ? "liquid-glass-subtle text-white" : "text-white/60 hover:text-white/90 hover:bg-white/[0.04]"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" style={{ color: item.active ? "hsl(var(--sidebar-primary))" : undefined }} />
              {sidebarOpen && <span>{item.label}</span>}
            </motion.button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "hsl(var(--sidebar-primary))", color: "white" }}>LR</div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white/90">Luis Roquette</p>
                <p className="text-xs truncate text-white/40">Superadmin</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ══════════════ MAIN ══════════════ */}
      <div className="flex-1 flex flex-col min-h-screen relative z-[1]">
        <header className="h-14 flex items-center px-4 md:px-6 sticky top-0 z-10 liquid-glass-header">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors mr-3">
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><Sun className="h-5 w-5 text-muted-foreground" /></button>
            <button className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors"><Bell className="h-5 w-5 text-muted-foreground" /></button>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl font-bold text-foreground font-heading tracking-tight">Configurações</h1>
              <p className="text-sm text-muted-foreground mt-1">Personalize os campos e preferências do sistema</p>
            </motion.div>

            {/* Search — Liquid Glass */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Buscar configurações..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full liquid-glass-input pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                  <X className="h-3 w-3 text-foreground" />
                </button>
              )}
            </motion.div>

            {/* Segmented Control — Liquid Glass */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="liquid-glass-subtle p-1 flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.key ? "text-primary-foreground shadow-lg" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]"
                  }`}
                  style={activeTab === tab.key ? {
                    background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                    boxShadow: "0 4px 16px hsl(var(--primary) / 0.25)",
                  } : {}}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </motion.div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === "campos" && (
                <motion.div key="campos" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-8">
                  <div className="flex items-center gap-2.5 px-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary/50" />
                    <p className="text-xs text-muted-foreground/50">Arraste para reordenar · Toggle para ativar/desativar · Aplicado em novos relatórios</p>
                  </div>
                  <SettingsGroup title="Campos de Energia" icon={Zap} iconBg="bg-primary/15 text-primary" campos={camposEnergia} setCampos={setCamposEnergia} addLabel="Adicionar campo" />
                  <SettingsGroup title="Campos de OPEX" icon={DollarSign} iconBg="bg-warning/15 text-warning" campos={camposOpex} setCampos={setCamposOpex} addLabel="Adicionar despesa" />
                </motion.div>
              )}

              {activeTab === "geral" && (
                <motion.div key="geral" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Preferências</p>
                    <div className="liquid-glass overflow-hidden">
                      <SettingRow icon={Save} iconBg="bg-primary/15 text-primary" label="Salvamento Automático" description="Salvar alterações automaticamente ao sair" on={autoSave} onToggle={() => setAutoSave(!autoSave)} />
                      <SettingRow icon={HelpCircle} iconBg="bg-info/15 text-info" label="Dicas e Orientações" description="Exibir dicas contextuais durante o uso" on={showHints} onToggle={() => setShowHints(!showHints)} />
                      <SettingRow icon={Eye} iconBg="bg-white/[0.06] text-muted-foreground" label="Modo Compacto" description="Reduzir espaçamento para ver mais informações" on={compactMode} onToggle={() => setCompactMode(!compactMode)} isLast />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Informações</p>
                    <div className="liquid-glass overflow-hidden">
                      <div className="flex items-center px-4 py-3.5 border-b border-white/[0.06]">
                        <p className="text-sm text-muted-foreground/60 flex-1">Versão do Sistema</p>
                        <p className="text-sm text-foreground font-medium">2.4.1</p>
                      </div>
                      <div className="flex items-center px-4 py-3.5">
                        <p className="text-sm text-muted-foreground/60 flex-1">Última atualização</p>
                        <p className="text-sm text-foreground font-medium">02/04/2026</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "notificacoes" && (
                <motion.div key="notificacoes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Alertas</p>
                  <div className="liquid-glass overflow-hidden">
                    <SettingRow icon={Bell} iconBg="bg-destructive/15 text-destructive" label="Relatórios Pendentes" description="Notificar quando há relatórios aguardando envio" on={true} onToggle={() => {}} />
                    <SettingRow icon={Zap} iconBg="bg-warning/15 text-warning" label="Metas Atingidas" description="Avisar quando uma usina atinge a meta mensal" on={true} onToggle={() => {}} />
                    <SettingRow icon={Factory} iconBg="bg-primary/15 text-primary" label="Status das Usinas" description="Alertar mudanças no status operacional" on={false} onToggle={() => {}} isLast />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions — Liquid Glass */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex gap-3 pt-2 pb-4">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground liquid-glass-btn"
                style={{
                  background: saved
                    ? "hsl(var(--success))"
                    : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                }}
              >
                {saved ? <><CheckCircle2 className="h-5 w-5" />Salvo!</> : <><Save className="h-5 w-5" />Salvar</>}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-medium text-muted-foreground liquid-glass-subtle hover:bg-white/[0.08] transition-all"
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar
              </motion.button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockupConfiguracoes;

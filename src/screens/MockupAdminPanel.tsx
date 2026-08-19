import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Settings, Shield, Menu, Sun, Bell, Search,
  LayoutDashboard, FileText, Factory,
  UserPlus, Wrench, Trash2, Edit, Lock, Activity, Zap, X
} from "lucide-react";
import coesaGreen from "@/assets/logos/coesa-green.png";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: FileText, label: "Relatórios", active: false },
  { icon: Factory, label: "Usinas", active: false },
  { icon: Shield, label: "Admin", active: true },
  { icon: Settings, label: "Configurações", active: false },
];

const mockUsers = [
  { nome: "Luis Roquette", email: "luisroquette@coesaenergia.com.br", perfil: "Superadmin", status: "Sempre ativo", avatar: "LR" },
  { nome: "Maria Santos", email: "maria.santos@coesaenergia.com.br", perfil: "Admin", status: "Ativo", avatar: "MS" },
  { nome: "João Pereira", email: "joao.pereira@coesaenergia.com.br", perfil: "Operador", status: "Ativo", avatar: "JP" },
];

const mockUsinas = [
  { nome: "UFV Solar Norte I", potencia: "5.2 MWp", status: "Operando", cidade: "Montes Claros - MG" },
  { nome: "UFV Cerrado II", potencia: "3.8 MWp", status: "Operando", cidade: "Uberaba - MG" },
  { nome: "UFV Vale do Sol", potencia: "7.1 MWp", status: "Manutenção", cidade: "Patos de Minas - MG" },
];

const MockupAdminPanel = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"usuarios" | "usinas" | "logs">("usuarios");
  const [toggleRegistro, setToggleRegistro] = useState(true);
  const [toggleManutencao, setToggleManutencao] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    { id: "usuarios" as const, label: "Usuários", count: 3, icon: Users },
    { id: "usinas" as const, label: "Usinas", count: 9, icon: Factory },
    { id: "logs" as const, label: "Logs", count: 0, icon: Activity },
  ];

  const Toggle = ({ on, onToggle, color = "bg-primary" }: { on: boolean; onToggle: () => void; color?: string }) => (
    <button
      onClick={onToggle}
      className={`w-12 h-7 rounded-full relative transition-colors duration-300 shrink-0 ${on ? color : "bg-white/[0.1]"}`}
      style={on ? { boxShadow: "0 0 12px hsl(var(--primary) / 0.25)" } : {}}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`absolute top-[2px] left-[2px] h-[23px] w-[23px] rounded-full bg-white shadow-md ${
          on ? "translate-x-[21px]" : "translate-x-0"
        } transition-transform duration-300`}
      />
    </button>
  );

  const perfilStyle = (perfil: string) => {
    if (perfil === "Superadmin") return "text-warning";
    if (perfil === "Admin") return "text-primary";
    return "text-secondary";
  };

  return (
    <div className="min-h-screen flex w-full text-foreground font-sans liquid-glass-bg" style={{ background: "hsl(var(--background))" }}>
      {/* ══════════════ SIDEBAR ══════════════ */}
      <aside
        className={`hidden md:flex flex-col transition-all duration-300 liquid-glass-sidebar ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
      >
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
            <button className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
              <Sun className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="relative p-2 rounded-xl hover:bg-white/[0.06] transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground font-heading tracking-tight">Administração</h1>
                <p className="text-sm text-muted-foreground mt-1">Gerencie usuários, usinas e monitore o sistema</p>
              </div>
              <span className="hidden sm:flex liquid-glass-pill px-3 py-1.5 text-xs font-semibold text-primary">Superadmin</span>
            </motion.div>

            {/* Quick Settings — Liquid Glass group */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">Controles Rápidos</p>
              <div className="liquid-glass overflow-hidden">
                <div className="flex items-center px-4 py-4 border-b border-white/[0.06]">
                  <div className="p-1.5 rounded-xl bg-primary/15 mr-3 shrink-0">
                    <UserPlus className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Registro de Novos Usuários</p>
                    <p className="text-[11px] text-muted-foreground/50">Permitir auto-registro via Google OAuth</p>
                  </div>
                  <Toggle on={toggleRegistro} onToggle={() => setToggleRegistro(!toggleRegistro)} />
                </div>
                <div className="flex items-center px-4 py-4">
                  <div className="p-1.5 rounded-xl bg-warning/15 mr-3 shrink-0">
                    <Wrench className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Modo de Manutenção</p>
                    <p className="text-[11px] text-muted-foreground/50">Exibe aviso em todas as telas</p>
                  </div>
                  <Toggle on={toggleManutencao} onToggle={() => setToggleManutencao(!toggleManutencao)} color="bg-warning" />
                </div>
              </div>
            </motion.div>

            {/* Search — Liquid Glass input */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }} className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <input
                type="text"
                placeholder="Buscar usuários, usinas..."
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-3">
              <div className="liquid-glass-subtle p-1 flex gap-1 flex-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      activeTab === tab.id
                        ? "text-primary-foreground shadow-lg"
                        : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]"
                    }`}
                    style={
                      activeTab === tab.id
                        ? {
                            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                            boxShadow: "0 4px 16px hsl(var(--primary) / 0.25)",
                          }
                        : {}
                    }
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id ? "bg-white/20 text-primary-foreground" : "bg-white/[0.06] text-muted-foreground/50"
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground liquid-glass-btn shrink-0"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                }}
              >
                <UserPlus className="h-4 w-4" />
                Novo Usuário
              </motion.button>
            </motion.div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === "usuarios" && (
                <motion.div
                  key="usuarios"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                    {mockUsers.length} Usuários
                  </p>
                  <div className="liquid-glass overflow-hidden">
                    {mockUsers.map((user, i) => (
                      <motion.div
                        key={user.email}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex items-center px-4 py-4 group hover:bg-white/[0.04] transition-colors ${
                          i < mockUsers.length - 1 ? "border-b border-white/[0.06]" : ""
                        }`}
                      >
                        <div className="h-10 w-10 rounded-full liquid-glass-subtle flex items-center justify-center text-xs font-bold text-primary mr-3 shrink-0">
                          {user.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{user.nome}</p>
                            <span className={`liquid-glass-pill px-2 py-0.5 text-[10px] font-semibold ${perfilStyle(user.perfil)}`}>
                              {user.perfil}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">{user.email}</p>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 mr-4">
                          <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
                          <span className="text-[11px] text-muted-foreground/50">{user.status}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" title="Editar">
                            <Edit className="h-3.5 w-3.5 text-muted-foreground/50" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors" title="Permissões">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Remover">
                            <Trash2 className="h-3.5 w-3.5 text-destructive/60" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "usinas" && (
                <motion.div
                  key="usinas"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                    {mockUsinas.length} Usinas
                  </p>
                  <div className="liquid-glass overflow-hidden">
                    {mockUsinas.map((usina, i) => (
                      <motion.div
                        key={usina.nome}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex items-center px-4 py-4 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                          i < mockUsinas.length - 1 ? "border-b border-white/[0.06]" : ""
                        }`}
                      >
                        <div className="p-2 rounded-xl liquid-glass-subtle mr-3 shrink-0">
                          <Zap className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{usina.nome}</p>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">{usina.cidade}</p>
                        </div>
                        <div className="hidden sm:block text-right mr-4">
                          <p className="text-sm font-bold text-primary">{usina.potencia}</p>
                        </div>
                        <span className={`liquid-glass-pill px-2.5 py-1 text-[11px] font-semibold shrink-0 ${
                          usina.status === "Operando" ? "text-primary" : "text-warning"
                        }`}>
                          {usina.status}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === "logs" && (
                <motion.div
                  key="logs"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="liquid-glass p-12 text-center"
                >
                  <Activity className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground/60">Nenhum log registrado</p>
                  <p className="text-xs text-muted-foreground/30 mt-1">Os logs de atividade aparecerão aqui</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockupAdminPanel;

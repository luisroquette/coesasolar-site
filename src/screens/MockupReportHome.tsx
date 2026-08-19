import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, ChevronDown, Settings, Plus, X,
  Zap, DollarSign, Check, ArrowRight,
  Factory, Shield, LayoutDashboard, Menu, Sun, Bell,
  Sparkles, Clock
} from "lucide-react";
import coesaGreen from "@/assets/logos/coesa-green.png";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: FileText, label: "Relatórios", active: true },
  { icon: Factory, label: "Usinas", active: false },
  { icon: Shield, label: "Admin", active: false },
  { icon: Settings, label: "Configurações", active: false },
];

const recentReports = [
  { usina: "UFV Solar Norte I", mes: "Fev/2026", status: "Gerado" },
  { usina: "UFV Cerrado II", mes: "Fev/2026", status: "Gerado" },
  { usina: "UFV Vale do Sol", mes: "Jan/2026", status: "Pendente" },
];

const MockupReportHome = () => {
  const [activeStep, setActiveStep] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const steps = [
    { num: 1, label: "Identificação", desc: "Usina e período" },
    { num: 2, label: "Arquivo", desc: "Upload Saldo GD" },
    { num: 3, label: "Dados", desc: "Energia e OPEX" },
  ];

  return (
    <div className="min-h-screen flex w-full text-foreground font-sans liquid-glass-bg" style={{ background: "hsl(var(--background))" }}>
      {/* ══════════════ SIDEBAR — Liquid Glass ══════════════ */}
      <aside
        className={`hidden md:flex flex-col transition-all duration-300 liquid-glass-sidebar ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
      >
        <div className="p-4 border-b border-white/[0.06]">
          <img
            src={coesaGreen}
            alt="COESA"
            className={`transition-all duration-300 ${sidebarOpen ? "h-8" : "h-6 mx-auto"}`}
          />
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {sidebarItems.map((item) => (
            <motion.button
              key={item.label}
              whileHover={{ x: 4 }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? "liquid-glass-subtle text-white"
                  : "text-white/60 hover:text-white/90 hover:bg-white/[0.04]"
              }`}
            >
              <item.icon
                className="h-5 w-5 shrink-0"
                style={{ color: item.active ? "hsl(var(--sidebar-primary))" : undefined }}
              />
              {sidebarOpen && <span>{item.label}</span>}
            </motion.button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: "hsl(var(--sidebar-primary))", color: "white" }}
            >
              LR
            </div>
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
        {/* Top Bar — Liquid Glass Header */}
        <header className="h-14 flex items-center px-4 md:px-6 sticky top-0 z-10 liquid-glass-header">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors mr-3"
          >
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

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Page Header */}
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl font-bold text-foreground font-heading tracking-tight">
                Gerador de Relatórios
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Transforme o export do Saldo GD em relatório formatado
              </p>
            </motion.div>

            {/* Stepper — Liquid Glass card */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="liquid-glass p-4"
            >
              <div className="flex items-center gap-0">
                {steps.map((step, i) => (
                  <div key={step.num} className="flex items-center flex-1 last:flex-initial">
                    <button onClick={() => setActiveStep(step.num)} className="flex items-center gap-2.5 group">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                          activeStep >= step.num
                            ? "text-primary-foreground shadow-md"
                            : "bg-white/[0.06] text-muted-foreground"
                        }`}
                        style={
                          activeStep >= step.num
                            ? {
                                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                                boxShadow: "0 0 16px hsl(var(--primary) / 0.3)",
                              }
                            : {}
                        }
                      >
                        {activeStep > step.num ? <Check className="w-4 h-4" strokeWidth={3} /> : step.num}
                      </div>
                      <div className="hidden sm:block text-left">
                        <p className={`text-xs font-semibold transition-colors ${
                          activeStep >= step.num ? "text-foreground" : "text-muted-foreground/60"
                        }`}>
                          {step.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground/40">{step.desc}</p>
                      </div>
                    </button>
                    {i < 2 && (
                      <div className="flex-1 mx-3">
                        <div className="h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
                            initial={{ width: 0 }}
                            animate={{ width: activeStep > step.num ? "100%" : "0%" }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Step Content */}
            <AnimatePresence mode="wait">
              {activeStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                    Identificação
                  </p>
                  <div className="liquid-glass overflow-hidden">
                    <div className="flex items-center px-4 py-4 border-b border-white/[0.06]">
                      <div className="p-1.5 rounded-xl bg-primary/15 mr-3 shrink-0">
                        <Factory className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground flex-1">Usina</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground/60">
                        <span>Selecione</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="flex items-center px-4 py-4 border-b border-white/[0.06]">
                      <div className="p-1.5 rounded-xl bg-info/15 mr-3 shrink-0">
                        <Clock className="h-4 w-4 text-info" />
                      </div>
                      <p className="text-sm font-medium text-foreground flex-1">Mês</p>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground/60">
                        <span>Março</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <div className="flex items-center px-4 py-4">
                      <div className="p-1.5 rounded-xl bg-warning/15 mr-3 shrink-0">
                        <Sparkles className="h-4 w-4 text-warning" />
                      </div>
                      <p className="text-sm font-medium text-foreground flex-1">Ano</p>
                      <span className="text-sm font-medium text-foreground">2026</span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveStep(2)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground liquid-glass-btn"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                    }}
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </motion.div>
              )}

              {activeStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                    Arquivo do Saldo GD
                  </p>
                  <div className="liquid-glass overflow-hidden">
                    <div className="p-8 text-center">
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="w-16 h-16 rounded-2xl liquid-glass-subtle flex items-center justify-center mx-auto mb-4"
                      >
                        <Upload className="h-7 w-7 text-primary" />
                      </motion.div>
                      <p className="text-sm font-medium text-foreground mb-1">Arraste o arquivo aqui</p>
                      <p className="text-xs text-muted-foreground/60">
                        ou{" "}
                        <span className="text-primary font-medium underline underline-offset-2 cursor-pointer">
                          selecione do computador
                        </span>
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-4">
                        <span className="liquid-glass-pill px-3 py-1 text-[11px] text-muted-foreground font-medium">.xlsx</span>
                        <span className="liquid-glass-pill px-3 py-1 text-[11px] text-muted-foreground font-medium">.csv</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setActiveStep(1)}
                      className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-medium text-muted-foreground liquid-glass-subtle hover:bg-white/[0.08] transition-all"
                    >
                      Voltar
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActiveStep(3)}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground liquid-glass-btn"
                      style={{
                        background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                      }}
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {activeStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Energia */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <div className="p-1.5 rounded-xl bg-primary/15">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">Energia</h3>
                    </div>
                    <div className="liquid-glass overflow-hidden">
                      {["Energia Gerada (kWh)", "Energia Injetada (kWh)", "Energia Compensada (kWh)"].map(
                        (label, i, arr) => (
                          <div key={label} className={`flex items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-white/[0.06]" : ""}`}>
                            <p className="text-sm font-medium text-foreground flex-1">{label}</p>
                            <input
                              type="text"
                              defaultValue="0.00"
                              className="w-24 bg-transparent text-sm text-right text-foreground font-medium tabular-nums focus:outline-none"
                            />
                          </div>
                        )
                      )}
                    </div>
                    <button className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-all px-1">
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar campo
                    </button>
                  </div>

                  {/* OPEX */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <div className="p-1.5 rounded-xl bg-warning/15">
                        <DollarSign className="h-3.5 w-3.5 text-warning" />
                      </div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">OPEX — Despesas</h3>
                    </div>
                    <div className="liquid-glass overflow-hidden">
                      {["Fatura de energia da Usina", "Segurança Patrimonial", "O&M"].map(
                        (label, i, arr) => (
                          <div key={label} className={`flex items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-white/[0.06]" : ""}`}>
                            <p className="text-sm font-medium text-foreground flex-1">{label}</p>
                            <span className="text-xs text-muted-foreground/40 mr-1">R$</span>
                            <input
                              type="text"
                              defaultValue="0.00"
                              className="w-24 bg-transparent text-sm text-right text-foreground font-medium tabular-nums focus:outline-none"
                            />
                          </div>
                        )
                      )}
                    </div>
                    <button className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-all px-1">
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar despesa
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setActiveStep(2)}
                      className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-medium text-muted-foreground liquid-glass-subtle hover:bg-white/[0.08] transition-all"
                    >
                      Voltar
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-primary-foreground liquid-glass-btn"
                      style={{
                        background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))",
                      }}
                    >
                      <FileText className="h-5 w-5" />
                      Gerar Relatório
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recent reports — Liquid Glass list */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="space-y-2"
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                Relatórios Recentes
              </p>
              <div className="liquid-glass overflow-hidden">
                {recentReports.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center px-4 py-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                      i < recentReports.length - 1 ? "border-b border-white/[0.06]" : ""
                    }`}
                  >
                    <div className="p-1.5 rounded-xl bg-primary/10 mr-3 shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{r.usina}</p>
                      <p className="text-[11px] text-muted-foreground/50">{r.mes}</p>
                    </div>
                    <span className={`liquid-glass-pill px-2.5 py-1 text-[11px] font-semibold ${
                      r.status === "Gerado" ? "text-primary" : "text-warning"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockupReportHome;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Index from "./screens/Index";
import Auth from "./screens/Auth";
import Dashboard from "./screens/Dashboard";
import Assinantes from "./screens/Assinantes";
import AssinantesIniciais from "./screens/AssinantesIniciais";
import AssinantesClienteGD from "./screens/AssinantesClienteGD";
import Usineiros from "./screens/Usineiros";
import FluxoCaixa from "./screens/FluxoCaixa";
import Historico from "./screens/Historico";
import CRM from "./screens/CRM";
import Configuracoes from "./screens/Configuracoes";
import Admin from "./screens/Admin";
import PropostaPublica from "./screens/PropostaPublica";
import PropostaPublicaRedirect from "./screens/PropostaPublicaRedirect";
import SolicitarPropostaDefinitiva from "./screens/SolicitarPropostaDefinitiva";
import WhatsApp from "./screens/WhatsApp";
import AIGym from "./screens/AIGym";
import AgentSettings from "./screens/AgentSettings";
import RAGDashboard from "./screens/RAGDashboard";
import ProposalTemplateEditor from "./screens/ProposalTemplateEditor";
import Treinamento from "./screens/Treinamento";
import DetectionPatterns from "./screens/DetectionPatterns";
import SelfImprovement from "./screens/SelfImprovement";
import MockupReportHome from "./screens/MockupReportHome";
import MockupAdminPanel from "./screens/MockupAdminPanel";
import MockupConfiguracoes from "./screens/MockupConfiguracoes";
import NotFound from "./screens/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/proposta/:id" element={<PropostaPublica />} />
      <Route path="/solicitar-contrato/:id" element={<SolicitarPropostaDefinitiva />} />
      {/* Retrocompatibilidade URLs antigas */}
      <Route path="/proposta-inicial/:id" element={<PropostaPublica />} />
      <Route path="/proposta-definitiva/:id" element={<PropostaPublica />} />
      <Route path="/solicitar-proposta-definitiva/:id" element={<SolicitarPropostaDefinitiva />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/assinantes" element={<ProtectedRoute><Assinantes /></ProtectedRoute>} />
      <Route path="/assinantes/iniciais" element={<ProtectedRoute><AssinantesIniciais /></ProtectedRoute>} />
      <Route path="/assinantes/cliente-gd" element={<ProtectedRoute><AssinantesClienteGD /></ProtectedRoute>} />
      <Route path="/usineiros" element={<ProtectedRoute><Usineiros /></ProtectedRoute>} />
      <Route path="/fluxo-caixa" element={<ProtectedRoute><FluxoCaixa /></ProtectedRoute>} />
      <Route path="/historico" element={<ProtectedRoute><Historico /></ProtectedRoute>} />
      <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
      <Route path="/ai-gym" element={<ProtectedRoute><AIGym /></ProtectedRoute>} />
      <Route path="/ai-gym/:agentId" element={<ProtectedRoute><AgentSettings /></ProtectedRoute>} />
      <Route path="/ai-gym/patterns" element={<ProtectedRoute><DetectionPatterns /></ProtectedRoute>} />
      <Route path="/rag-dashboard" element={<ProtectedRoute><RAGDashboard /></ProtectedRoute>} />
      <Route path="/treinamento" element={<ProtectedRoute><Treinamento /></ProtectedRoute>} />
      <Route path="/template-editor" element={<ProtectedRoute><ProposalTemplateEditor /></ProtectedRoute>} />
      <Route path="/template-editor/:templateId" element={<ProtectedRoute><ProposalTemplateEditor /></ProtectedRoute>} />
      <Route path="/self-improvement" element={<ProtectedRoute><SelfImprovement /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="/mockup/relatorios" element={<MockupReportHome />} />
      <Route path="/mockup/admin" element={<MockupAdminPanel />} />
      <Route path="/mockup/configuracoes" element={<MockupConfiguracoes />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

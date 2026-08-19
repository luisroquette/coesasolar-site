import { 
  LayoutDashboard, 
  Users, 
  Factory, 
  Settings, 
  LogOut,
  FileText,
  TrendingUp,
  UserSearch,
  Shield,
  ChevronDown,
  FileCheck,
  FileClock,
  ArrowRightLeft,
  MessageCircle,
  Bot,
  BookOpen,
  GraduationCap
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { CoesaLogo } from './CoesaLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const menuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Propostas Usineiros', url: '/usineiros', icon: Factory },
  { title: 'Fluxo de Caixa', url: '/fluxo-caixa', icon: TrendingUp },
  { title: 'Histórico', url: '/historico', icon: FileText },
  { title: 'Micro CRM', url: '/crm', icon: UserSearch },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

const propostasAssinantesSubmenu = [
  { title: 'Proposta Definitiva', url: '/assinantes', icon: FileCheck },
  { title: 'Proposta Inicial', url: '/assinantes/iniciais', icon: FileClock },
  { title: 'Cliente com GD', url: '/assinantes/cliente-gd', icon: ArrowRightLeft },
];

// Agents are now accessed only through the AI Gym grid - no individual submenus

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { isAdmin } = useUserRole();
  const collapsed = state === 'collapsed';
  
  const isPropostasActive = location.pathname.startsWith('/assinantes');
  const isAIGymActive = location.pathname.startsWith('/ai-gym');
  const isRAGActive = location.pathname === '/rag-dashboard';
  const isTreinamentoActive = location.pathname === '/treinamento';
  const [propostasOpen, setPropostasOpen] = useState(isPropostasActive);

  return (
    <Sidebar className={cn(collapsed ? 'w-16' : 'w-64')}>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <CoesaLogo variant="green" size={collapsed ? 'sm' : 'lg'} />
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className={cn(collapsed && 'sr-only')}>
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/dashboard"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      location.pathname === '/dashboard' && 'bg-sidebar-primary text-sidebar-primary-foreground'
                    )}
                  >
                    <LayoutDashboard className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="font-medium">Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Propostas Assinantes - Collapsible */}
              <SidebarMenuItem>
                {collapsed ? (
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/assinantes"
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        isPropostasActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                      )}
                    >
                      <Users className="w-5 h-5 shrink-0" />
                    </NavLink>
                  </SidebarMenuButton>
                ) : (
                  <Collapsible open={propostasOpen} onOpenChange={setPropostasOpen}>
                    <CollapsibleTrigger asChild>
                      <button
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full',
                          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          isPropostasActive && 'bg-sidebar-accent/50'
                        )}
                      >
                        <Users className="w-5 h-5 shrink-0" />
                        <span className="font-medium flex-1 text-left">Propostas Assinantes</span>
                        <ChevronDown className={cn(
                          'w-4 h-4 transition-transform',
                          propostasOpen && 'rotate-180'
                        )} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-sidebar-border pl-3">
                        {propostasAssinantesSubmenu.map((subItem) => {
                          const isSubActive = location.pathname === subItem.url;
                          return (
                            <NavLink
                              key={subItem.title}
                              to={subItem.url}
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm',
                                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                isSubActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                              )}
                            >
                              <subItem.icon className="w-4 h-4 shrink-0" />
                              <span>{subItem.title}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </SidebarMenuItem>

              {/* Demais itens do menu */}
              {menuItems.slice(1).map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          isActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        {!collapsed && <span className="font-medium">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Seção AI Gym */}
        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className={cn(collapsed && 'sr-only')}>
            AI Gym
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Link direto para o AI Gym */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/ai-gym"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isAIGymActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                    )}
                  >
                    <Bot className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="font-medium">Agentes</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Knowledge Base / RAG Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/rag-dashboard"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isRAGActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                    )}
                  >
                    <BookOpen className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="font-medium">Knowledge Base</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Treinamento de Vendas */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/treinamento"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isTreinamentoActive && 'bg-sidebar-primary text-sidebar-primary-foreground'
                    )}
                  >
                    <GraduationCap className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="font-medium">Treinamento</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* WhatsApp (configurações gerais) */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/whatsapp"
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      location.pathname === '/whatsapp' && 'bg-sidebar-primary text-sidebar-primary-foreground'
                    )}
                  >
                    <MessageCircle className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="font-medium">WhatsApp</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className={cn(collapsed && 'sr-only')}>
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        location.pathname === '/admin' && 'bg-sidebar-primary text-sidebar-primary-foreground'
                      )}
                    >
                      <Shield className="w-5 h-5 shrink-0" />
                      {!collapsed && <span className="font-medium">Painel Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="mb-3 px-2">
            <p className="text-xs text-sidebar-foreground/60">Logado como</p>
            <p className="text-sm text-sidebar-foreground truncate">{user.email}</p>
            {isAdmin && (
              <Badge variant="secondary" className="mt-1 text-xs">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </Badge>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent',
            collapsed && 'justify-center px-2'
          )}
          onClick={signOut}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
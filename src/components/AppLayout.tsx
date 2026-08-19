import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AdminNotifications } from './admin/AdminNotifications';
import { ThemeToggle } from './ThemeToggle';
import { useUserRole } from '@/hooks/useUserRole';
import { useGoalNotifications } from '@/hooks/useGoalNotifications';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isAdmin } = useUserRole();
  
  // Monitor goals and send notifications when achieved
  useGoalNotifications();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-screen">
          <header className="h-14 border-b border-border flex items-center px-4 bg-card sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1" />
            <ThemeToggle />
            {isAdmin && <AdminNotifications />}
          </header>
          <div className="flex-1 p-6 bg-muted/30">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

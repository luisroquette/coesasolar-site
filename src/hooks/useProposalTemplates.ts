import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProposalTemplate, TemplatePage, CanvasElementData } from '@/components/proposal-editor/types';

export function useProposalTemplates() {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proposal_templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Parse pages JSON
      const parsed = (data || []).map((t) => ({
        ...t,
        pages: (t.pages as unknown as TemplatePage[]) || [],
      })) as ProposalTemplate[];
      
      setTemplates(parsed);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Erro ao carregar templates',
        description: 'Não foi possível carregar os templates de proposta.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const createTemplate = useCallback(
    async (template: Omit<ProposalTemplate, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
          .from('proposal_templates')
          .insert({
            name: template.name,
            description: template.description,
            type: template.type,
            pages: JSON.parse(JSON.stringify(template.pages)),
            is_active: template.is_active,
            created_by: userData.user?.id,
            updated_by: userData.user?.id,
          } as any)
          .select()
          .single();

        if (error) throw error;

        const newTemplate = {
          ...data,
          pages: (data.pages as unknown as TemplatePage[]) || [],
        } as ProposalTemplate;

        setTemplates((prev) => [newTemplate, ...prev]);
        
        toast({
          title: 'Template criado',
          description: 'O template foi criado com sucesso.',
        });

        return newTemplate;
      } catch (error) {
        console.error('Error creating template:', error);
        toast({
          title: 'Erro ao criar template',
          description: 'Não foi possível criar o template.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast]
  );

  const updateTemplate = useCallback(
    async (id: string, updates: Partial<ProposalTemplate>) => {
      try {
        const { data: userData } = await supabase.auth.getUser();

        // If setting as active, deactivate other templates of same type
        if (updates.is_active) {
          const template = templates.find((t) => t.id === id);
          if (template) {
            await supabase
              .from('proposal_templates')
              .update({ is_active: false })
              .eq('type', template.type)
              .neq('id', id);
          }
        }

        const { data, error } = await supabase
          .from('proposal_templates')
          .update({
            ...updates,
            pages: updates.pages ? JSON.parse(JSON.stringify(updates.pages)) : undefined,
            updated_by: userData.user?.id,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        const updatedTemplate = {
          ...data,
          pages: (data.pages as unknown as TemplatePage[]) || [],
        } as ProposalTemplate;

        setTemplates((prev) =>
          prev.map((t) => {
            if (t.id === id) return updatedTemplate;
            // If we activated this template, deactivate others of same type
            if (updates.is_active && t.type === updatedTemplate.type) {
              return { ...t, is_active: false };
            }
            return t;
          })
        );

        toast({
          title: 'Template atualizado',
          description: 'As alterações foram salvas.',
        });

        return updatedTemplate;
      } catch (error) {
        console.error('Error updating template:', error);
        toast({
          title: 'Erro ao atualizar template',
          description: 'Não foi possível salvar as alterações.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [templates, toast]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('proposal_templates')
          .delete()
          .eq('id', id);

        if (error) throw error;

        setTemplates((prev) => prev.filter((t) => t.id !== id));

        toast({
          title: 'Template excluído',
          description: 'O template foi excluído com sucesso.',
        });

        return true;
      } catch (error) {
        console.error('Error deleting template:', error);
        toast({
          title: 'Erro ao excluir template',
          description: 'Não foi possível excluir o template.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast]
  );

  const getActiveTemplate = useCallback(
    (type: 'inicial' | 'definitiva') => {
      return templates.find((t) => t.type === type && t.is_active);
    },
    [templates]
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getActiveTemplate,
  };
}

// Hook for a single template editor
export function useTemplateEditor(templateId?: string) {
  const [template, setTemplate] = useState<ProposalTemplate | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<ProposalTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const hasChanges = template && originalTemplate 
    ? JSON.stringify(template) !== JSON.stringify(originalTemplate)
    : false;

  const fetchTemplate = useCallback(async () => {
    if (!templateId) {
      // Create a new template
      const newTemplate: ProposalTemplate = {
        id: '',
        name: 'Novo Template',
        type: 'inicial',
        pages: [{
          id: 'page-1',
          elements: [],
          backgroundColor: '#ffffff',
        }],
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTemplate(newTemplate);
      setOriginalTemplate(newTemplate);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proposal_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;

      const parsed = {
        ...data,
        pages: (data.pages as unknown as TemplatePage[]) || [{
          id: 'page-1',
          elements: [],
          backgroundColor: '#ffffff',
        }],
      } as ProposalTemplate;

      setTemplate(parsed);
      setOriginalTemplate(JSON.parse(JSON.stringify(parsed)));
    } catch (error) {
      console.error('Error fetching template:', error);
      toast({
        title: 'Erro ao carregar template',
        description: 'Não foi possível carregar o template.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [templateId, toast]);

  const saveTemplate = useCallback(async () => {
    if (!template) return null;

    try {
      setSaving(true);
      const { data: userData } = await supabase.auth.getUser();

      // If activating, deactivate other templates of same type
      if (template.is_active) {
        await supabase
          .from('proposal_templates')
          .update({ is_active: false })
          .eq('type', template.type)
          .neq('id', template.id);
      }

      if (template.id) {
        // Update existing
        const { data, error } = await supabase
          .from('proposal_templates')
          .update({
            name: template.name,
            description: template.description,
            type: template.type,
            pages: JSON.parse(JSON.stringify(template.pages)),
            is_active: template.is_active,
            updated_by: userData.user?.id,
          } as any)
          .eq('id', template.id)
          .select()
          .single();

        if (error) throw error;

        const updated = {
          ...data,
          pages: (data.pages as unknown as TemplatePage[]) || [],
        } as ProposalTemplate;

        setTemplate(updated);
        setOriginalTemplate(JSON.parse(JSON.stringify(updated)));

        toast({
          title: 'Template salvo',
          description: 'As alterações foram salvas com sucesso.',
        });

        return updated;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('proposal_templates')
          .insert({
            name: template.name,
            description: template.description,
            type: template.type,
            pages: JSON.parse(JSON.stringify(template.pages)),
            is_active: template.is_active,
            created_by: userData.user?.id,
            updated_by: userData.user?.id,
          } as any)
          .select()
          .single();

        if (error) throw error;

        const created = {
          ...data,
          pages: (data.pages as unknown as TemplatePage[]) || [],
        } as ProposalTemplate;

        setTemplate(created);
        setOriginalTemplate(JSON.parse(JSON.stringify(created)));

        toast({
          title: 'Template criado',
          description: 'O template foi criado com sucesso.',
        });

        return created;
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o template.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [template, toast]);

  const resetChanges = useCallback(() => {
    if (originalTemplate) {
      setTemplate(JSON.parse(JSON.stringify(originalTemplate)));
    }
  }, [originalTemplate]);

  const updateTemplateField = useCallback(
    <K extends keyof ProposalTemplate>(field: K, value: ProposalTemplate[K]) => {
      setTemplate((prev) => prev ? { ...prev, [field]: value } : null);
    },
    []
  );

  const addElement = useCallback(
    (pageIndex: number, element: Omit<CanvasElementData, 'id' | 'zIndex'>) => {
      setTemplate((prev) => {
        if (!prev) return null;
        const newPages = [...prev.pages];
        const page = newPages[pageIndex];
        if (!page) return prev;

        const maxZIndex = page.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
        const newElement: CanvasElementData = {
          ...element,
          id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          zIndex: maxZIndex + 1,
        };

        newPages[pageIndex] = {
          ...page,
          elements: [...page.elements, newElement],
        };

        return { ...prev, pages: newPages };
      });
    },
    []
  );

  const updateElement = useCallback(
    (pageIndex: number, elementId: string, updates: Partial<CanvasElementData>) => {
      setTemplate((prev) => {
        if (!prev) return null;
        const newPages = [...prev.pages];
        const page = newPages[pageIndex];
        if (!page) return prev;

        newPages[pageIndex] = {
          ...page,
          elements: page.elements.map((el) =>
            el.id === elementId ? { ...el, ...updates } : el
          ),
        };

        return { ...prev, pages: newPages };
      });
    },
    []
  );

  const deleteElement = useCallback((pageIndex: number, elementId: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = newPages[pageIndex];
      if (!page) return prev;

      newPages[pageIndex] = {
        ...page,
        elements: page.elements.filter((el) => el.id !== elementId),
      };

      return { ...prev, pages: newPages };
    });
  }, []);

  const duplicateElement = useCallback((pageIndex: number, elementId: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = newPages[pageIndex];
      if (!page) return prev;

      const element = page.elements.find((el) => el.id === elementId);
      if (!element) return prev;

      const maxZIndex = page.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
      const newElement: CanvasElementData = {
        ...element,
        id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        x: element.x + 20,
        y: element.y + 20,
        zIndex: maxZIndex + 1,
      };

      newPages[pageIndex] = {
        ...page,
        elements: [...page.elements, newElement],
      };

      return { ...prev, pages: newPages };
    });
  }, []);

  const bringForward = useCallback((pageIndex: number, elementId: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = newPages[pageIndex];
      if (!page) return prev;

      const maxZIndex = page.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);

      newPages[pageIndex] = {
        ...page,
        elements: page.elements.map((el) =>
          el.id === elementId ? { ...el, zIndex: maxZIndex + 1 } : el
        ),
      };

      return { ...prev, pages: newPages };
    });
  }, []);

  const sendBackward = useCallback((pageIndex: number, elementId: string) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = newPages[pageIndex];
      if (!page) return prev;

      const minZIndex = page.elements.reduce((min, el) => Math.min(min, el.zIndex), Infinity);

      newPages[pageIndex] = {
        ...page,
        elements: page.elements.map((el) =>
          el.id === elementId ? { ...el, zIndex: Math.max(0, minZIndex - 1) } : el
        ),
      };

      return { ...prev, pages: newPages };
    });
  }, []);

  const addPage = useCallback(() => {
    setTemplate((prev) => {
      if (!prev) return null;
      const newPage: TemplatePage = {
        id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        elements: [],
        backgroundColor: '#ffffff',
      };
      return { ...prev, pages: [...prev.pages, newPage] };
    });
  }, []);

  const deletePage = useCallback((pageIndex: number) => {
    setTemplate((prev) => {
      if (!prev || prev.pages.length <= 1) return prev;
      const newPages = prev.pages.filter((_, idx) => idx !== pageIndex);
      return { ...prev, pages: newPages };
    });
  }, []);

  const duplicatePage = useCallback((pageIndex: number) => {
    setTemplate((prev) => {
      if (!prev) return null;
      const page = prev.pages[pageIndex];
      if (!page) return prev;

      const duplicatedPage: TemplatePage = {
        id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        elements: page.elements.map((el) => ({
          ...el,
          id: `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        })),
        backgroundColor: page.backgroundColor,
      };

      const newPages = [...prev.pages];
      newPages.splice(pageIndex + 1, 0, duplicatedPage);
      return { ...prev, pages: newPages };
    });
  }, []);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  return {
    template,
    loading,
    saving,
    hasChanges,
    saveTemplate,
    resetChanges,
    updateTemplateField,
    addElement,
    updateElement,
    deleteElement,
    duplicateElement,
    bringForward,
    sendBackward,
    addPage,
    deletePage,
    duplicatePage,
  };
}

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Maximize2, Download, RefreshCw, Sparkles, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PropostaAssinantePDF, AssinantePDFData } from './PropostaAssinantePDF';
import { generatePDFFromElement, downloadPDF } from './pdf-utils';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PDFPreviewNewProps {
  data: AssinantePDFData;
}

export function PDFPreviewNew({ data }: PDFPreviewNewProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isComponentPreview, setIsComponentPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  
  // Memoize data to prevent unnecessary re-renders
  const stableData = useMemo(() => JSON.stringify(data), [data]);

  // Generate PDF preview
  const generatePreview = useCallback(async () => {
    if (!isVisible) return;
    
    setIsGenerating(true);
    
    // Wait for the component to render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const blob = await generatePDFFromElement('proposta-assinante-pdf', {
        filename: 'preview.pdf',
        quality: 0.8,
        scale: 1.5
      });
      
      // Revoke previous URL if exists
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [isVisible, previewUrl]);

  // Generate preview when data changes
  useEffect(() => {
    if (!isVisible) return;
    
    const timeout = setTimeout(generatePreview, 500);
    return () => clearTimeout(timeout);
  }, [stableData, isVisible]);

  // Cleanup URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      await downloadPDF('proposta-assinante-pdf', {
        filename: `Proposta_COESA_${data.cliente.nome || 'Cliente'}.pdf`.replace(/\s+/g, '_'),
        quality: 0.95,
        scale: 2
      });
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const PreviewContent = ({ height = '500px' }: { height?: string }) => (
    <div className="w-full bg-muted rounded-lg overflow-hidden relative" style={{ height }}>
      {previewUrl ? (
        <iframe
          src={`${previewUrl}#toolbar=0&navpanes=0`}
          className="w-full h-full border-0"
          title="PDF Preview"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
            <p className="text-sm">Gerando preview...</p>
          </div>
        </div>
      )}
      
      {isGenerating && previewUrl && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Hidden container for PDF generation */}
      <div 
        ref={previewContainerRef}
        className="fixed -left-[9999px] top-0 z-[-1]"
        style={{ width: '210mm' }}
      >
        <PropostaAssinantePDF data={data} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Preview do PDF
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isGenerating}
            >
              <Download className="h-4 w-4 mr-1" />
              Baixar PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsComponentPreview(true)}
              className="text-primary border-primary/30 hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Ver Animado
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={generatePreview}
              disabled={isGenerating}
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(!isVisible)}
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(true)}
              title="Ver PDF em tela cheia"
            >
              <FileText className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isVisible ? (
            <PreviewContent height="400px" />
          ) : (
            <div className="h-[100px] flex items-center justify-center text-muted-foreground bg-muted rounded-lg">
              <p className="text-sm">Preview desativado - clique no ícone para ativar</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen PDF Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-5xl h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Preview do PDF - Tela Cheia
            </DialogTitle>
          </DialogHeader>
          <PreviewContent height="calc(90vh - 80px)" />
        </DialogContent>
      </Dialog>

      {/* Fullscreen Animated Component Dialog */}
      <Dialog open={isComponentPreview} onOpenChange={setIsComponentPreview}>
        <DialogContent className="max-w-4xl h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b bg-gradient-to-r from-primary/10 to-primary/5">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                <span>Proposta Animada - Preview Interativo</span>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={isGenerating}
                className="mr-8"
              >
                <Download className="h-4 w-4 mr-1" />
                Baixar PDF
              </Button>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[calc(95vh-60px)]">
            <div className="p-6 bg-gradient-to-b from-muted/50 to-background min-h-full">
              <div className="max-w-[210mm] mx-auto shadow-2xl rounded-lg overflow-hidden">
                <PropostaAssinantePDF data={data} key={isComponentPreview ? 'animate' : 'static'} />
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

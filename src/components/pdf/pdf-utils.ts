import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PDFGenerationOptions {
  filename: string;
  quality?: number;
  scale?: number;
}

export async function generatePDFFromElement(
  elementId: string,
  options: PDFGenerationOptions
): Promise<Blob> {
  const element = document.getElementById(elementId);
  
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const { filename, quality = 0.95, scale = 2 } = options;

  // Capture the element as canvas with high resolution
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  // A4 dimensions in mm
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  
  // Calculate dimensions
  const imgWidth = A4_WIDTH_MM;
  const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;
  
  // Create PDF
  const pdf = new jsPDF({
    orientation: imgHeight > A4_HEIGHT_MM ? 'portrait' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Add image to PDF
  const imgData = canvas.toDataURL('image/jpeg', quality);
  
  // If the content is taller than one page, we need to handle pagination
  if (imgHeight > A4_HEIGHT_MM) {
    let position = 0;
    let remainingHeight = imgHeight;
    let pageNumber = 0;

    while (remainingHeight > 0) {
      if (pageNumber > 0) {
        pdf.addPage();
      }
      
      pdf.addImage(
        imgData,
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      
      remainingHeight -= A4_HEIGHT_MM;
      position -= A4_HEIGHT_MM;
      pageNumber++;
    }
  } else {
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
  }

  return pdf.output('blob');
}

export async function downloadPDF(
  elementId: string,
  options: PDFGenerationOptions
): Promise<void> {
  const blob = await generatePDFFromElement(elementId, options);
  
  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generatePDFPreviewUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function generatePDFBase64(
  elementId: string,
  options: Omit<PDFGenerationOptions, 'filename'>
): Promise<string> {
  const element = document.getElementById(elementId);
  
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const { quality = 0.95, scale = 2 } = options;

  // Capture the element as canvas with high resolution
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  // A4 dimensions in mm
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  
  // Calculate dimensions
  const imgWidth = A4_WIDTH_MM;
  const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;
  
  // Create PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Add image to PDF
  const imgData = canvas.toDataURL('image/jpeg', quality);
  
  // If the content is taller than one page, handle pagination
  if (imgHeight > A4_HEIGHT_MM) {
    let position = 0;
    let remainingHeight = imgHeight;
    let pageNumber = 0;

    while (remainingHeight > 0) {
      if (pageNumber > 0) {
        pdf.addPage();
      }
      
      pdf.addImage(
        imgData,
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      
      remainingHeight -= A4_HEIGHT_MM;
      position -= A4_HEIGHT_MM;
      pageNumber++;
    }
  } else {
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
  }

  // Return as base64 string (without data URI prefix)
  return pdf.output('datauristring').split(',')[1];
}

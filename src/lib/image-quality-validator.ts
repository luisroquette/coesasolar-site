/**
 * Image Quality Validator
 * Validates image quality before sending to AI processing
 * Now loads configuration from database (Zero Hardcode)
 */

import { supabase } from '@/integrations/supabase/client';

export interface ImageQualityResult {
  isValid: boolean;
  score: number; // 0-100
  issues: ImageQualityIssue[];
}

export interface ImageQualityIssue {
  type: 'dark' | 'bright' | 'blurry' | 'small' | 'cropped';
  severity: 'warning' | 'error';
  message: string;
}

interface ImageQualityConfig {
  minWidth: number;
  minHeight: number;
  minBrightness: number;
  maxBrightness: number;
  minContrast: number;
  aspectRatioMin: number;
  aspectRatioMax: number;
  messages: Record<string, string>;
}

// Fallback values
const FALLBACK_CONFIG: ImageQualityConfig = {
  minWidth: 400,
  minHeight: 300,
  minBrightness: 40,
  maxBrightness: 240,
  minContrast: 25,
  aspectRatioMin: 0.4,
  aspectRatioMax: 3.0,
  messages: {
    small: 'Imagem muito pequena ({{width}}x{{height}}px). Mínimo recomendado: {{minWidth}}x{{minHeight}}px',
    cropped_conta: 'A proporção da imagem parece incorreta. Certifique-se de capturar toda a conta de luz.',
    cropped_doc: 'A proporção da imagem parece incorreta. Certifique-se de capturar o documento inteiro.',
    dark: 'A imagem está muito escura. Tente fotografar com melhor iluminação.',
    bright: 'A imagem está muito clara ou com reflexo. Evite luz direta sobre o documento.',
    blurry: 'A imagem parece estar borrada. Mantenha a câmera firme e o documento em foco.',
    validation_error: 'Não foi possível validar a qualidade da imagem.',
  }
};

// Cache for config
let configCache: ImageQualityConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load configuration from database
 */
async function loadConfig(): Promise<ImageQualityConfig> {
  if (configCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return configCache;
  }

  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'image_quality_min_width',
        'image_quality_min_height',
        'image_quality_min_brightness',
        'image_quality_max_brightness',
        'image_quality_min_contrast',
        'image_quality_aspect_ratio_min',
        'image_quality_aspect_ratio_max',
        'image_quality_messages',
      ]);

    if (error || !data) {
      console.warn('[ImageQuality] Error loading config, using fallback:', error);
      return FALLBACK_CONFIG;
    }

    const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));
    
    let messages = FALLBACK_CONFIG.messages;
    if (configMap['image_quality_messages']) {
      try {
        messages = JSON.parse(configMap['image_quality_messages']);
      } catch {
        console.warn('[ImageQuality] Error parsing messages, using fallback');
      }
    }

    configCache = {
      minWidth: parseInt(configMap['image_quality_min_width'] || '') || FALLBACK_CONFIG.minWidth,
      minHeight: parseInt(configMap['image_quality_min_height'] || '') || FALLBACK_CONFIG.minHeight,
      minBrightness: parseInt(configMap['image_quality_min_brightness'] || '') || FALLBACK_CONFIG.minBrightness,
      maxBrightness: parseInt(configMap['image_quality_max_brightness'] || '') || FALLBACK_CONFIG.maxBrightness,
      minContrast: parseInt(configMap['image_quality_min_contrast'] || '') || FALLBACK_CONFIG.minContrast,
      aspectRatioMin: parseFloat(configMap['image_quality_aspect_ratio_min'] || '') || FALLBACK_CONFIG.aspectRatioMin,
      aspectRatioMax: parseFloat(configMap['image_quality_aspect_ratio_max'] || '') || FALLBACK_CONFIG.aspectRatioMax,
      messages,
    };
    cacheTimestamp = Date.now();

    return configCache;
  } catch (err) {
    console.warn('[ImageQuality] Exception loading config:', err);
    return FALLBACK_CONFIG;
  }
}

/**
 * Replace template variables in message
 */
function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] || ''));
}

/**
 * Load an image from a base64 string or File
 */
export async function loadImage(source: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem'));
    
    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(source);
    }
  });
}

/**
 * Calculate average brightness of an image (0-255)
 */
function calculateBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let totalBrightness = 0;
  const pixelCount = data.length / 4;
  
  for (let i = 0; i < data.length; i += 4) {
    // Luminosity formula: 0.299*R + 0.587*G + 0.114*B
    const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    totalBrightness += brightness;
  }
  
  return totalBrightness / pixelCount;
}

/**
 * Calculate contrast/sharpness using Laplacian variance
 * Higher values = sharper image
 */
function calculateContrast(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Convert to grayscale array
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Calculate Laplacian variance (simplified)
  let variance = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Laplacian kernel: center * 4 - neighbors
      const laplacian = 4 * gray[idx] 
        - gray[idx - 1] 
        - gray[idx + 1] 
        - gray[idx - width] 
        - gray[idx + width];
      
      variance += laplacian * laplacian;
      count++;
    }
  }
  
  // Return normalized variance (higher = sharper)
  return Math.sqrt(variance / count);
}

/**
 * Validate image quality
 */
export async function validateImageQuality(
  source: string | File,
  documentType: 'identificacao' | 'contaLuz'
): Promise<ImageQualityResult> {
  const issues: ImageQualityIssue[] = [];
  let score = 100;
  
  // Load config from database
  const config = await loadConfig();
  
  try {
    const img = await loadImage(source);
    
    // Check dimensions
    if (img.width < config.minWidth || img.height < config.minHeight) {
      issues.push({
        type: 'small',
        severity: 'error',
        message: formatMessage(config.messages.small, {
          width: img.width,
          height: img.height,
          minWidth: config.minWidth,
          minHeight: config.minHeight,
        })
      });
      score -= 30;
    }
    
    // Check aspect ratio (detect cropping)
    const aspectRatio = img.width / img.height;
    if (aspectRatio < config.aspectRatioMin || aspectRatio > config.aspectRatioMax) {
      issues.push({
        type: 'cropped',
        severity: 'warning',
        message: documentType === 'contaLuz' 
          ? config.messages.cropped_conta
          : config.messages.cropped_doc
      });
      score -= 15;
    }
    
    // Create canvas for pixel analysis
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      return { isValid: true, score: 70, issues: [] };
    }
    
    // Use smaller size for analysis (performance)
    const analysisWidth = Math.min(img.width, 800);
    const analysisHeight = Math.min(img.height, 800);
    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
    
    ctx.drawImage(img, 0, 0, analysisWidth, analysisHeight);
    const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight);
    
    // Check brightness
    const brightness = calculateBrightness(imageData);
    
    if (brightness < config.minBrightness) {
      issues.push({
        type: 'dark',
        severity: brightness < 25 ? 'error' : 'warning',
        message: config.messages.dark
      });
      score -= brightness < 25 ? 30 : 20;
    } else if (brightness > config.maxBrightness) {
      issues.push({
        type: 'bright',
        severity: 'warning',
        message: config.messages.bright
      });
      score -= 15;
    }
    
    // Check blur/sharpness
    const contrast = calculateContrast(imageData);
    
    if (contrast < config.minContrast) {
      issues.push({
        type: 'blurry',
        severity: contrast < 15 ? 'error' : 'warning',
        message: config.messages.blurry
      });
      score -= contrast < 15 ? 30 : 20;
    }
    
    // Ensure score doesn't go below 0
    score = Math.max(0, score);
    
    // Determine if valid (score >= 50 and no error-level issues)
    const hasErrors = issues.some(i => i.severity === 'error');
    const isValid = score >= 50 && !hasErrors;
    
    return { isValid, score, issues };
    
  } catch (error) {
    console.error('Image quality validation error:', error);
    // If we can't validate, assume it's okay but with a warning
    return { 
      isValid: true, 
      score: 70, 
      issues: [{
        type: 'blurry',
        severity: 'warning',
        message: config.messages.validation_error
      }]
    };
  }
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

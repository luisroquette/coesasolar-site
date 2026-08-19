/**
 * Text Extraction Utilities
 * Shared helpers for extracting text from various AI response formats
 */

/**
 * Robust text extraction from various AI response formats
 * Handles OpenAI, Anthropic, Gemini, and custom response structures
 */
export function extractAssistantText(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    console.error('extractAssistantText: data is not an object', typeof data);
    return null;
  }

  const obj = data as Record<string, unknown>;

  if (obj.error) {
    console.error('extractAssistantText: error in response body', JSON.stringify(obj.error));
    throw new Error(`AI API error: ${JSON.stringify(obj.error)}`);
  }

  // OpenAI format: choices[0].message.content
  const choices = obj.choices as Array<Record<string, unknown>> | undefined;
  if (choices && choices.length > 0) {
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    if (message) {
      const content = message.content;
      
      if (typeof content === 'string' && content.trim()) {
        return content.trim();
      }
      
      // Handle array content (Gemini style)
      if (Array.isArray(content)) {
        const textParts: string[] = [];
        for (const part of content) {
          if (typeof part === 'string') {
            textParts.push(part);
          } else if (part && typeof part === 'object') {
            const partObj = part as Record<string, unknown>;
            if (typeof partObj.text === 'string') {
              textParts.push(partObj.text);
            } else if (typeof partObj.content === 'string') {
              textParts.push(partObj.content);
            }
          }
        }
        if (textParts.length > 0) {
          return textParts.join('').trim();
        }
      }
    }
    
    // Legacy format: choices[0].text
    const text = choices[0]?.text;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  }

  // Anthropic/other format: output_text
  if (typeof obj.output_text === 'string' && (obj.output_text as string).trim()) {
    return (obj.output_text as string).trim();
  }

  // Alternative format: output[0].content[0].text
  const output = obj.output as Array<Record<string, unknown>> | undefined;
  if (output && output.length > 0) {
    const contentArr = output[0]?.content as Array<Record<string, unknown>> | undefined;
    if (contentArr && contentArr.length > 0) {
      const text = contentArr[0]?.text;
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
  }

  console.error('extractAssistantText: could not extract text. Object keys:', Object.keys(obj));
  return null;
}

/**
 * Clean and normalize text for comparison
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .trim();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract phone number from text
 */
export function extractPhoneFromText(text: string): string | null {
  const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4,5}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex);
  if (matches && matches.length > 0) {
    return matches[0].replace(/\D/g, '');
  }
  return null;
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

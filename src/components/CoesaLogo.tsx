import { cn } from '@/lib/utils';
import coesaGreen from '@/assets/logos/coesa-green.png';
import coesaWhite from '@/assets/logos/coesa-white.png';
import coesaBlack from '@/assets/logos/coesa-black.png';

interface CoesaLogoProps {
  className?: string;
  variant?: 'green' | 'white' | 'black';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-6',
  md: 'h-8',
  lg: 'h-10',
  xl: 'h-14',
};

const logoVariants = {
  green: coesaGreen,
  white: coesaWhite,
  black: coesaBlack,
};

export function CoesaLogo({ className, variant = 'green', size = 'md' }: CoesaLogoProps) {
  const logoSrc = logoVariants[variant];
  
  return (
    <img 
      src={logoSrc} 
      alt="COESA Energia Inteligente" 
      className={cn(sizeClasses[size], 'w-auto object-contain', className)}
    />
  );
}

// Export logo paths for use in PDF generation or other contexts
export const COESA_LOGOS = {
  green: coesaGreen,
  white: coesaWhite,
  black: coesaBlack,
};

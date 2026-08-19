import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isBot = role === 'assistant';

  return (
    <div
      className={cn(
        'flex gap-2 mb-3',
        isBot ? 'justify-start' : 'justify-end'
      )}
    >
      {isBot && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}
      
      <div
        className={cn(
          'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
          isBot
            ? 'bg-card text-card-foreground rounded-tl-sm shadow-sm border'
            : 'bg-primary text-primary-foreground rounded-tr-sm'
        )}
      >
        {content}
      </div>

      {!isBot && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

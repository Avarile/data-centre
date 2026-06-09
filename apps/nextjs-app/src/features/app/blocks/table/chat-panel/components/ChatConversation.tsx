import { Sparkles } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../../../../../../components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '../../../../../../components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../../../../../../components/ai-elements/reasoning';
import { Shimmer } from '../../../../../../components/ai-elements/shimmer';
import type { IMessage } from '../types';

interface IChatConversationProps {
  messages: IMessage[];
  isStreaming: boolean;
  isThinking: boolean;
}

export const ChatConversation = ({ messages, isStreaming, isThinking }: IChatConversationProps) => {
  const { t } = useTranslation('common');

  return (
    <Conversation>
      <ConversationContent>
        {messages.length === 0 && (
          <ConversationEmptyState className="absolute inset-0">
            <Sparkles className="size-8 text-muted-foreground/40" />
            <Shimmer className="text-base font-medium" duration={3}>
              {t('ai.chat.emptyStateHeadline', 'How can I help you today?')}
            </Shimmer>
            <p className="text-sm text-muted-foreground">
              {t('ai.chat.emptyState', 'Ask anything about your data.')}
            </p>
          </ConversationEmptyState>
        )}

        {messages.map((msg, i) => {
          if (msg.isDivider) {
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-1 py-2 text-xs text-muted-foreground"
              >
                <div className="h-px flex-1 bg-border" />
                <span>{msg.content}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            );
          }

          const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
          const showThinking = isLastAssistant && isThinking;
          const hasReasoning = !!msg.reasoning;
          const hasContent = !!msg.content;
          // Reasoning is "live" until the answer starts streaming
          const isReasoningStreaming = isLastAssistant && isStreaming && !hasContent;

          return (
            <Message key={i} from={msg.role}>
              <MessageContent>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <>
                    {(hasReasoning || showThinking) && (
                      <Reasoning isStreaming={isReasoningStreaming || showThinking}>
                        <ReasoningTrigger />
                        <ReasoningContent>{msg.reasoning ?? ''}</ReasoningContent>
                      </Reasoning>
                    )}
                    {hasContent && (
                      <MessageResponse isAnimating={isLastAssistant && isStreaming}>
                        {msg.content}
                      </MessageResponse>
                    )}
                  </>
                )}
              </MessageContent>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};

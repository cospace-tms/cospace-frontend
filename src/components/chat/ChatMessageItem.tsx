import React from 'react';
import { Message } from '../../hooks/useChat';
import { Pin, Paperclip, AlertCircle, RefreshCw, Trash2, Smile } from 'lucide-react';
import { AuthenticatedImage } from '../AuthenticatedImage';
import { getApiUrl } from '../../utils/apiUrl';

interface ChatMessageItemProps {
  msg: Message;
  currentUserId: string;
  isEn: boolean;
  onSetReplyTarget: (message: Message | null) => void;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  handleTogglePin: (messageId: string, currentPinned: boolean) => Promise<void>;
  handleAddItemFromMessage: (msg: Message, defaultTab?: 'task' | 'event') => void;
  onRetryMessage: (messageId: string) => void;
  onDeleteFailedMessage: (messageId: string) => void;
  scrollToMessage: (messageId: string) => void;
  replaceMentions: (html: string) => string;
  replaceCustomEmojis: (html: string) => string;
  parseMarkdownToHtml: (md: string) => string;
  formatTime: (timeStr: string) => string;
  formatFileSize: (size: number) => string;
  isImageFile: (fileName: string) => boolean;
  showEmojiPaletteMsgId: string | null;
  setShowEmojiPaletteMsgId: (id: string | null) => void;
  customEmojis?: any[];
  emojiPalette: string[];
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  msg,
  currentUserId,
  isEn,
  onSetReplyTarget,
  onToggleReaction,
  handleTogglePin,
  handleAddItemFromMessage,
  onRetryMessage,
  onDeleteFailedMessage,
  scrollToMessage,
  replaceMentions,
  replaceCustomEmojis,
  parseMarkdownToHtml,
  formatTime,
  formatFileSize,
  isImageFile,
  showEmojiPaletteMsgId,
  setShowEmojiPaletteMsgId,
  customEmojis = [],
  emojiPalette,
}) => {
  const isSelf = msg.userId === currentUserId;

  const renderContent = (content: string) => {
    return replaceMentions(replaceCustomEmojis(parseMarkdownToHtml(content)));
  };

  // リアクション集計
  const reactionsMap = (msg.reactions || []).reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.userId);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <div id={`message-${msg.id}`} className={`message-card ${isSelf ? 'self' : ''} ${msg.isPinned ? 'pinned' : ''}`}>
      <div className="message-avatar">
        {msg.user.displayName.substring(0, 1).toUpperCase()}
      </div>
      <div className="message-content-wrapper">
        <div className="message-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="message-sender">{msg.user.displayName}</span>
          <span className="message-time">{formatTime(msg.createdAt)}</span>
          {msg.isPinned && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--accent-warning, #f59e0b)', fontWeight: 'bold' }}>
              <Pin size={10} fill="var(--accent-warning, #f59e0b)" />
              {isEn ? 'Pinned' : 'ピン留め済'}
            </span>
          )}
        </div>

        {/* 引用返信（リプライ）の表示 */}
        {msg.parentMessage && (
          <div 
            className="reply-quote-preview" 
            onClick={() => scrollToMessage(msg.parentId!)}
            title={isEn ? 'Click to jump to the quoted message' : 'クリックして引用元メッセージに移動'}
          >
            <span className="reply-quote-sender">@{msg.parentMessage.userDisplayName}</span>
            <span className="reply-quote-content" dangerouslySetInnerHTML={{ __html: renderContent(msg.parentMessage.content) }}></span>
          </div>
        )}
        
        {/* メッセージ本文の吹き出し */}
        {msg.content && (
          <div 
            className={`message-bubble ${msg.status === 'sending' ? 'pending' : ''} markdown-body`}
            dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
          />
        )}

        {/* 添付ファイルの表示 */}
        {msg.fileUrl && (
          <div className="message-attachment" style={{ marginTop: '6px' }}>
            {isImageFile(msg.fileName || '') ? (
              <div className="attachment-image-preview">
                <AuthenticatedImage 
                  src={msg.fileUrl} 
                  alt={msg.fileName || 'Attachment'} 
                  style={{ maxWidth: '300px', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}
                  onClick={(_e, blobUrl) => window.open(blobUrl || getApiUrl(msg.fileUrl), '_blank')}
                />
              </div>
            ) : (
              <a 
                href={getApiUrl(msg.fileUrl)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="attachment-file-link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '6px', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
              >
                <Paperclip size={16} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 500 }}>{msg.fileName}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatFileSize(msg.fileSize || 0)}</span>
                </div>
              </a>
            )}
          </div>
        )}

        {/* ステータスインジケーター（楽観的UI） */}
        {msg.status === 'sending' && (
          <div className="status-indicator pending">
            <span>{isEn ? 'Sending...' : '送信中...'}</span>
          </div>
        )}

        {msg.status === 'failed' && (
          <div className="status-indicator failed">
            <AlertCircle size={12} />
            <span>{isEn ? 'Failed to send' : '送信に失敗しました'}</span>
            <button 
              className="retry-action-btn"
              onClick={() => onRetryMessage(msg.id)}
            >
              {isEn ? 'Retry' : '再試行'}
            </button>
            <button 
              className="delete-action-btn"
              onClick={() => onDeleteFailedMessage(msg.id)}
            >
              {isEn ? 'Delete' : '削除'}
            </button>
          </div>
        )}

        {/* リアクション一覧のバッジ表示 */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="reactions-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {Object.entries(reactionsMap).map(([emoji, userIds]) => {
              const hasReacted = userIds.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  className={`reaction-badge ${hasReacted ? 'active' : ''}`}
                  onClick={() => !isSelf && onToggleReaction(msg.id, emoji)}
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    padding: '2px 8px', 
                    background: hasReacted ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-panel)', 
                    border: '1px solid', 
                    borderColor: hasReacted ? 'rgba(14, 165, 233, 0.4)' : 'var(--border-light)', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    cursor: isSelf ? 'default' : 'pointer', 
                    color: hasReacted ? 'var(--accent-primary)' : 'var(--text-primary)',
                    transition: 'all 0.1s ease',
                    opacity: isSelf ? 0.8 : 1
                  }}
                  title={isSelf 
                    ? (isEn ? `${userIds.length} user(s) reacted (You cannot react to your own message)` : `${userIds.length}人がリアクションしました（自分のメッセージにはリアクションできません）`) 
                    : (isEn ? `${userIds.length} user(s) reacted` : `${userIds.length}人がリアクションしました`)}
                  disabled={isSelf}
                >
                  {(() => {
                    const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
                    if (isCustom && customEmojis) {
                      const matched = customEmojis.find(e => e.code === emoji);
                      if (matched) {
                        return <img src={matched.url} alt={emoji} style={{ height: '16px', width: '16px', objectFit: 'contain' }} />;
                      }
                    }
                    return <span>{emoji}</span>;
                  })()}
                  <span style={{ fontWeight: 600 }}>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* メッセージアクション */}
        {msg.status === 'sent' && (
          <div className="message-actions" style={{ display: 'flex', gap: '6px', position: 'relative' }}>
            <button 
              className="message-actions-btn"
              onClick={() => onSetReplyTarget(msg)}
            >
              {isEn ? 'Reply' : '返信する'}
            </button>
            <button 
              className="message-actions-btn"
              onClick={() => handleAddItemFromMessage(msg, 'task')}
              title={isEn ? 'Register this message to task/schedule' : 'このメッセージをタスク・予定に登録'}
            >
              {isEn ? 'Add Task/Event' : 'タスク・予定追加'}
            </button>
            <button 
              className={`message-actions-btn ${msg.isPinned ? 'pinned' : ''}`}
              onClick={() => handleTogglePin(msg.id, !!msg.isPinned)}
              title={msg.isPinned ? (isEn ? 'Unpin message' : 'ピン留めを解除') : (isEn ? 'Pin message' : 'ピン留めする')}
              style={{ color: msg.isPinned ? 'var(--accent-warning, #f59e0b)' : 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Pin size={14} fill={msg.isPinned ? 'var(--accent-warning, #f59e0b)' : 'none'} />
            </button>

            {!isSelf && (
              <button 
                className="message-actions-btn"
                onClick={() => setShowEmojiPaletteMsgId(showEmojiPaletteMsgId === msg.id ? null : msg.id)}
                title={isEn ? 'Add reaction' : 'リアクションを追加'}
              >
                <Smile size={14} />
              </button>
            )}

            {/* 絵文字パレットポップアップ */}
            {showEmojiPaletteMsgId === msg.id && (
              <div 
                className="emoji-palette-popup"
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '6px',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  padding: '6px 10px',
                  display: 'flex',
                  gap: '6px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  zIndex: 20
                }}
              >
                {emojiPalette.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      onToggleReaction(msg.id, emoji);
                      setShowEmojiPaletteMsgId(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                      transition: 'transform 0.1s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

ChatMessageItem.displayName = 'ChatMessageItem';

import React, { useState, useCallback } from 'react';
import { Search, Loader, BookOpen, Clock, Pin } from 'lucide-react';
import { apiClient } from '../utils/apiClient';
import { useLanguage } from '../utils/i18n';

interface SearchViewProps {
  workspaceId: string | null;
  customEmojis: any[];
  onJumpToMessage?: (channelId: string, messageId: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  workspaceId,
  customEmojis = [],
  onJumpToMessage,
}) => {
  const { t } = useLanguage();
  const isEn = t('error') === 'Error';

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ messages: any[]; documents: any[] }>({ messages: [], documents: [] });
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !workspaceId) return;

    setSearching(true);
    setHasSearched(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: any }>(
        `/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`
      );
      if (res.success && res.data) {
        setResults(res.data);
      }
    } catch (err) {
      console.error('Failed to search workspace:', err);
    } finally {
      setSearching(false);
    }
  };

  // カスタム絵文字テキスト置換関数
  const replaceCustomEmojis = useCallback((htmlText: string) => {
    if (!htmlText || !customEmojis || customEmojis.length === 0) return htmlText;
    let result = htmlText;
    customEmojis.forEach((emoji) => {
      const escapedCode = emoji.code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedCode, 'g');
      result = result.replace(
        regex,
        `<img src="${emoji.url}" alt="${emoji.code}" title="${emoji.code}" class="custom-emoji-inline" style="height: 20px; width: 20px; object-fit: contain; vertical-align: middle; margin: 0 2px;" />`
      );
    });
    return result;
  }, [customEmojis]);

  // タイムスタンプフォーマット
  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', overflow: 'hidden' }}>
      {/* ヘッダーエリア */}
      <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <Search size={22} color="var(--accent-primary)" />
          {isEn ? 'Workspace Search' : 'ワークスペース横断検索'}
        </h1>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', maxWidth: '600px' }}>
          <input
            type="text"
            placeholder={isEn ? 'Search messages, documents...' : 'メッセージ、ドキュメントを検索...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: '14px',
              borderRadius: '6px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
            required
          />
          <button
            type="submit"
            disabled={searching}
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '6px',
              border: 'none',
              background: 'var(--accent-primary)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {searching ? <Loader className="spin" size={16} /> : (isEn ? 'Search' : '検索')}
          </button>
        </form>
      </div>

      {/* 結果表示エリア */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
        {searching ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Loader className="spin" size={32} color="var(--accent-primary)" />
          </div>
        ) : !hasSearched ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px', fontSize: '14px' }}>
            {isEn ? 'Enter keywords to search the entire workspace.' : 'キーワードを入力してワークスペース全体を検索します。'}
          </div>
        ) : results.messages.length === 0 && results.documents.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px', fontSize: '14px' }}>
            {isEn ? 'No results found.' : '検索結果が見つかりませんでした。'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px', maxWidth: '1000px', margin: '0 auto' }}>
            
            {/* 1. メッセージ結果セクション */}
            {results.messages.length > 0 && (
              <div>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                  {isEn ? `Messages (${results.messages.length})` : `メッセージ (${results.messages.length})`}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {results.messages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => onJumpToMessage?.(msg.channelId, msg.id)}
                      style={{
                        padding: '16px',
                        background: msg.isPinned ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-panel)',
                        border: '1px solid',
                        borderColor: msg.isPinned ? 'var(--accent-warning, #f59e0b)' : 'var(--border-light)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, border-color 0.2s',
                      }}
                      className="search-result-item-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '14px' }}>{msg.userDisplayName}</span>
                          <span style={{ fontSize: '12px', padding: '2px 8px', background: 'var(--bg-active)', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                            #{msg.channelName}
                          </span>
                          {msg.isPinned && (
                            <span 
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: 'var(--accent-warning, #f59e0b)', fontWeight: 600 }}
                              title={isEn ? 'Pinned message' : 'ピン留めされたメッセージ'}
                            >
                              <Pin size={12} fill="var(--accent-warning, #f59e0b)" />
                              {isEn ? 'Pinned' : 'ピン留め済み'}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {formatDateTime(msg.createdAt)}
                        </span>
                      </div>
                      <div
                        style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-all' }}
                        dangerouslySetInnerHTML={{ __html: replaceCustomEmojis(msg.snippet) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. ドキュメント結果セクション */}
            {results.documents.length > 0 && (
              <div>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                  {isEn ? `Documents (${results.documents.length})` : `ドキュメント (${results.documents.length})`}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {results.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (doc.sourceType === 'channel') {
                          onJumpToMessage?.(doc.sourceId, ''); // チャンネルに遷移
                        }
                      }}
                      style={{
                        padding: '16px',
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        cursor: doc.sourceType === 'channel' ? 'pointer' : 'default',
                        transition: 'border-color 0.2s'
                      }}
                      className="search-result-item-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <BookOpen size={16} color="var(--accent-primary)" />
                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '14px' }}>
                          {doc.sourceType === 'workspace' ? (isEn ? "Workspace Document" : "ワークスペースドキュメント") : `#${doc.title}`}
                        </span>
                        {doc.sourceType === 'channel' && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {isEn ? '(Channel Document)' : '(チャンネルドキュメント)'}
                          </span>
                        )}
                      </div>
                      <div
                        style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-all' }}
                        dangerouslySetInnerHTML={{ __html: doc.snippet }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

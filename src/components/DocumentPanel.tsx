import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Eye, Save, X, Maximize2, Minimize2, List, Menu } from 'lucide-react';
import { parseMarkdownToHtml, extractTocFromMarkdown, TocItem } from '../utils/markdown';
import { useLanguage } from '../utils/i18n';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import { apiClient } from '../utils/apiClient';
import { createPortal } from 'react-dom';

interface DocumentPanelProps {
  title: string;
  initialValue: string;
  onSave: (text: string) => Promise<void>;
  onClose?: () => void;
  onToggleFullScreen?: () => void;
  isFullScreen?: boolean;
  onMenuClick?: () => void;
  type?: 'workspace' | 'chat';
  lockKey: string;
  subheaderLeftPortalNode?: HTMLDivElement | null;
}

export const DocumentPanel: React.FC<DocumentPanelProps> = ({
  title,
  initialValue,
  onSave,
  onClose,
  onToggleFullScreen,
  isFullScreen,
  onMenuClick,
  type = 'workspace',
  lockKey,
  subheaderLeftPortalNode,
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [markdown, setMarkdown] = useState(initialValue);
  const [lockInfo, setLockInfo] = useState<{ isLocked: boolean; lockedByUserName?: string; lockedByUserId?: string } | null>(null);
  const [hasMyLock, setHasMyLock] = useState(false);
  const [acquiringLock, setAcquiringLock] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('cohive_toc_open');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleToc = () => {
    setIsTocOpen((prev) => {
      const next = !prev;
      localStorage.setItem('cohive_toc_open', String(next));
      return next;
    });
  };

  useEffect(() => {
    setMarkdown(initialValue);
  }, [initialValue]);

  useEffect(() => {
    setToc(extractTocFromMarkdown(markdown));
  }, [markdown]);

  useEffect(() => {
    if (mode === 'view') {
      Prism.highlightAll();
    }
  }, [mode, markdown]);

  const checkLockStatus = useCallback(async () => {
    try {
      const res = await apiClient.get<{ success: boolean; isLocked: boolean; lockedByUserName?: string; lockedByUserId?: string }>(
        `/api/document-locks/${encodeURIComponent(lockKey)}`
      );
      if (res.success) {
        setLockInfo(res.isLocked ? { isLocked: true, lockedByUserName: res.lockedByUserName, lockedByUserId: res.lockedByUserId } : null);
      }
    } catch (err) {
      console.error("Failed to check lock status:", err);
    }
  }, [lockKey]);

  useEffect(() => {
    checkLockStatus();
    const interval = setInterval(() => {
      if (!hasMyLock) {
        checkLockStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [checkLockStatus, hasMyLock]);

  useEffect(() => {
    if (!hasMyLock) return;
    const interval = setInterval(async () => {
      try {
        await apiClient.post(`/api/document-locks/${encodeURIComponent(lockKey)}/heartbeat`);
      } catch (err) {
        console.error("Failed to send lock heartbeat:", err);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [hasMyLock, lockKey]);

  useEffect(() => {
    const handleUnload = () => {
      if (hasMyLock) {
        // keepalive を使ってブラウザを閉じた際も非同期でロック解放
        fetch(`/api/document-locks/${encodeURIComponent(lockKey)}/release`, {
          method: 'POST',
          headers: {
            'X-User-Id': localStorage.getItem('cohive_user_id') || '',
          },
          keepalive: true,
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [hasMyLock, lockKey]);

  const startEditing = async () => {
    setAcquiringLock(true);
    try {
      const res = await apiClient.post<{ success: boolean; error?: string; lockedByUserName?: string }>(
        `/api/document-locks/${encodeURIComponent(lockKey)}/acquire`
      );
      if (res.success) {
        setHasMyLock(true);
        setMode('edit');
      } else {
        alert(
          res.lockedByUserName 
            ? (t('error') === 'Error' ? `${res.lockedByUserName} is editing this document now.` : `${res.lockedByUserName} さんが現在編集中のため、ロックを取得できませんでした。`)
            : (t('error') === 'Error' ? "Failed to acquire lock." : "ロックの取得に失敗しました。")
        );
        checkLockStatus();
      }
    } catch (err) {
      console.error("Lock acquire request failed:", err);
      alert(t('error') === 'Error' ? "Failed to start editing (server error)" : "編集を開始できませんでした（サーバーエラー）");
    } finally {
      setAcquiringLock(false);
    }
  };

  const releaseLock = async () => {
    if (!hasMyLock) return;
    try {
      await apiClient.post(`/api/document-locks/${encodeURIComponent(lockKey)}/release`);
    } catch (err) {
      console.error("Failed to release lock:", err);
    } finally {
      setHasMyLock(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(markdown);
      await releaseLock();
      setMode('view');
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to save document: ' : 'ドキュメントの保存に失敗しました: ') + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setMarkdown(initialValue);
    await releaseLock();
    setMode('view');
  };

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', minWidth: 0 }}>
      <div className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        {/* 上部：ドキュメントヘッダー（横幅全体） - type が workspace のときのみ表示 */}
        {type === 'workspace' && (
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              {onMenuClick && (
                <button className="mobile-menu-trigger" onClick={onMenuClick} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', display: 'flex', alignItems: 'center', marginRight: '8px' }}>
                  <Menu size={20} />
                </button>
              )}
              <h1 className="channel-info-title" style={{ margin: 0 }}>{title}</h1>
            </div>
          </div>
        )}

        {/* 下部：目次と本文の横並びコンテンツ */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* 左：目次（TOC） */}
          <div className={`document-toc ${isTocOpen ? '' : 'collapsed'}`}>
            <div className="document-toc-title">{t('error') === 'Error' ? 'Table of Contents' : '目次'}</div>
            {toc.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {t('error') === 'Error' ? 'No headings.' : '見出しがありません。'}
              </div>
            ) : (
              <ul className="document-toc-list">
                {toc.map((item) => (
                  <li
                    key={item.id}
                    className={`document-toc-item level-${Math.min(item.level, 3)}`}
                    onClick={() => scrollToHeading(item.id)}
                    title={item.text}
                  >
                    {item.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 右：本文コンテンツ領域とフローティングアクション */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            
            {/* ポータル経由でサブヘッダーの左側にレンダリングするコンテンツ */}
            {type === 'chat' && subheaderLeftPortalNode && createPortal(
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {lockInfo?.isLocked && (
                  <span 
                    style={{ 
                      fontSize: '10px', 
                      color: 'var(--accent-danger, #ef4444)', 
                      padding: '2px 4px', 
                      fontWeight: 'bold',
                      maxWidth: '120px',
                      wordBreak: 'break-all',
                      textAlign: 'center'
                    }}
                    title={`${lockInfo.lockedByUserName || ''} さんが編集中`}
                  >
                    ⚠️ {(lockInfo.lockedByUserName || '').substring(0, 8)}...
                  </span>
                )}
                {mode === 'view' ? (
                  <>
                    {/* 1. 目次トグルボタン */}
                    <button
                      onClick={handleToggleToc}
                      title={isTocOpen ? (t('error') === 'Error' ? 'Close table of contents' : '目次を閉じる') : (t('error') === 'Error' ? 'Open table of contents' : '目次を開く')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isTocOpen ? 'var(--bg-active, rgba(255, 255, 255, 0.05))' : 'transparent',
                        border: 'none',
                        color: isTocOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <List size={16} />
                    </button>

                    <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 2px' }} />

                    {/* 2. 編集ボタン */}
                    <button
                      onClick={startEditing}
                      disabled={!!lockInfo?.isLocked || acquiringLock}
                      title={lockInfo?.isLocked ? (t('error') === 'Error' ? `${lockInfo.lockedByUserName} is editing` : `${lockInfo.lockedByUserName} さんが編集中のため編集できません`) : (t('error') === 'Error' ? 'Edit document' : 'ドキュメントを編集')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: lockInfo?.isLocked ? 'var(--bg-active, rgba(255, 255, 255, 0.05))' : 'transparent',
                        border: 'none',
                        color: lockInfo?.isLocked ? 'var(--text-muted)' : 'var(--text-primary)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: (lockInfo?.isLocked || acquiringLock) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: lockInfo?.isLocked ? 0.5 : 1
                      }}
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    {/* 保存ボタン */}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      title={saving ? (t('error') === 'Error' ? 'Saving...' : '保存中...') : t('save')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--accent-primary)',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        fontSize: '12px',
                        fontWeight: '500',
                      }}
                    >
                      <Save size={14} style={{ marginRight: '4px' }} />
                      <span>{t('save')}</span>
                    </button>

                    {/* キャンセルボタン */}
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      title={t('error') === 'Error' ? 'Cancel changes' : '変更をキャンセル'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-active, rgba(255, 255, 255, 0.05))',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-muted)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        fontSize: '12px',
                        fontWeight: '500',
                      }}
                    >
                      <X size={14} style={{ marginRight: '4px' }} />
                      <span>{t('error') === 'Error' ? 'Cancel' : 'キャンセル'}</span>
                    </button>
                  </>
                )}
              </div>,
              subheaderLeftPortalNode
            )}

            {/* フローティングアクションパネル - ポータル不使用時のみ表示 */}
            {!(type === 'chat' && subheaderLeftPortalNode) && (
              <div 
                className="document-floating-actions"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '8px',
                  alignItems: 'center',
                  background: 'var(--bg-panel, rgba(30, 30, 46, 0.85))',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  border: '1px solid var(--border-light)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  transition: 'all 0.2s ease',
                  opacity: 0.8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              >
                {lockInfo?.isLocked && (
                  <span 
                    style={{ 
                      fontSize: '10px', 
                      color: 'var(--accent-danger, #ef4444)', 
                      padding: '2px 4px', 
                      fontWeight: 'bold',
                      maxWidth: '120px',
                      wordBreak: 'break-all',
                      textAlign: 'center'
                    }}
                    title={`${lockInfo.lockedByUserName || ''} さんが編集中`}
                  >
                    ⚠️ {(lockInfo.lockedByUserName || '').substring(0, 8)}...
                  </span>
                )}
                {mode === 'view' ? (
                  <>
                    {/* 1. 目次トグルボタン */}
                    <button
                      onClick={handleToggleToc}
                      title={isTocOpen ? (t('error') === 'Error' ? 'Close table of contents' : '目次を閉じる') : (t('error') === 'Error' ? 'Open table of contents' : '目次を開く')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isTocOpen ? 'var(--bg-active, rgba(255, 255, 255, 0.05))' : 'transparent',
                        border: 'none',
                        color: isTocOpen ? 'var(--accent-primary)' : 'var(--text-muted)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <List size={16} />
                    </button>

                    {/* 横配置用の区切り線 */}
                    <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 2px' }} />

                     {/* 2. 編集ボタン */}
                    <button
                      onClick={startEditing}
                      disabled={!!lockInfo?.isLocked || acquiringLock}
                      title={lockInfo?.isLocked ? (t('error') === 'Error' ? `${lockInfo.lockedByUserName} is editing` : `${lockInfo.lockedByUserName} さんが編集中のため編集できません`) : (t('error') === 'Error' ? 'Edit document' : 'ドキュメントを編集')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: lockInfo?.isLocked ? 'var(--bg-active, rgba(255, 255, 255, 0.05))' : 'transparent',
                        border: 'none',
                        color: lockInfo?.isLocked ? 'var(--text-muted)' : 'var(--text-primary)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: (lockInfo?.isLocked || acquiringLock) ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: lockInfo?.isLocked ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!lockInfo?.isLocked) e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))';
                      }}
                      onMouseLeave={(e) => {
                        if (!lockInfo?.isLocked) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    {/* 保存ボタン */}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      title={saving ? (t('error') === 'Error' ? 'Saving...' : '保存中...') : t('save')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--accent-primary)',
                        border: 'none',
                        color: '#fff',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Save size={16} />
                    </button>

                    {/* キャンセルボタン */}
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      title={t('error') === 'Error' ? 'Cancel changes' : '変更をキャンセル'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-active, rgba(255, 255, 255, 0.05))',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-muted)',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-panel-hover, rgba(255, 255, 255, 0.1))'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                    >
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            )}


            {/* 本文コンテンツ */}
            <div className="document-body">
              {mode === 'view' ? (
                <div
                  className="document-preview-content"
                  dangerouslySetInnerHTML={{
                    __html: parseMarkdownToHtml(markdown) || `<em style="color: var(--text-muted);">${t('error') === 'Error' ? 'No document has been created yet. You can create one using the "Edit" button.' : 'ドキュメントがまだ作成されていません。「編集」ボタンから作成できます。'}</em>`
                  }}
                />
              ) : (
                <textarea
                  className="document-editor-textarea"
                  placeholder={t('error') === 'Error' ? `Write document in Markdown.

# Overview
This is the document for this channel.

## Task List
- [ ] Set goals
- [x] Complete design` : `マークダウンでドキュメントを記述してください。

# 概要
これはこのチャンネルのドキュメントです。

## タスクリスト
- [ ] 目標の設定
- [x] 設計の完了`}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  disabled={saving}
                />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

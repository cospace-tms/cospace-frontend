import React, { useState, useEffect } from 'react';
import { AlertCircle, Info, AlertTriangle, X, ExternalLink } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content?: string;
  type: 'info' | 'warning' | 'critical';
  created_at?: string;
  createdAt?: string;
}

export const GlobalAnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements/active');
        if (res.ok) {
          const data = await res.json() as any;
          const list = data.announcements || data.data || (Array.isArray(data) ? data : []);
          if (Array.isArray(list)) {
            setAnnouncements(list);
          }
        }
      } catch (e) {
        // SaaS環境以外や通信失敗時は静かにスルー
      }
    };

    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 60000); // 1分ごとにチェック
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => [...prev, id]);
    if (selectedAnnouncement?.id === id) {
      setSelectedAnnouncement(null);
    }
  };

  const visibleAnnouncements = announcements.filter(a => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', zIndex: 9999, flexShrink: 0 }}>
        {visibleAnnouncements.map(ann => {
          const isCritical = ann.type === 'critical';
          const isWarning = ann.type === 'warning';

          const bg = isCritical ? 'rgba(239, 68, 68, 0.95)' : isWarning ? 'rgba(245, 158, 11, 0.95)' : 'rgba(14, 165, 233, 0.95)';
          const textColor = '#ffffff';
          const hasContent = Boolean(ann.content && ann.content.trim().length > 0);

          return (
            <div
              key={ann.id}
              onClick={() => {
                if (hasContent) {
                  setSelectedAnnouncement(ann);
                }
              }}
              style={{
                background: bg,
                color: textColor,
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 500,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                cursor: hasContent ? 'pointer' : 'default',
                transition: 'background 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                {isCritical ? <AlertTriangle size={16} style={{ flexShrink: 0 }} /> : isWarning ? <AlertCircle size={16} style={{ flexShrink: 0 }} /> : <Info size={16} style={{ flexShrink: 0 }} />}
                <span style={{ fontWeight: 700, flexShrink: 0 }}>[{ann.title}]</span>
                {hasContent && (
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', opacity: 0.9 }}>
                    {ann.content}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '12px' }}>
                {hasContent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnnouncement(ann);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: textColor,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>詳細を見る</span>
                    <ExternalLink size={12} />
                  </button>
                )}

                <button
                  onClick={(e) => handleDismiss(ann.id, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: textColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    opacity: 0.8
                  }}
                  title="閉じる"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 詳細表示モーダル */}
      {selectedAnnouncement && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              color: '#f8fafc'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: selectedAnnouncement.type === 'critical' ? 'rgba(239, 68, 68, 0.2)' : selectedAnnouncement.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(14, 165, 233, 0.2)',
                    color: selectedAnnouncement.type === 'critical' ? '#f87171' : selectedAnnouncement.type === 'warning' ? '#fbbf24' : '#38bdf8'
                  }}
                >
                  {selectedAnnouncement.type === 'critical' ? '緊急告知' : selectedAnnouncement.type === 'warning' ? '重要お知らせ' : '全体お知らせ'}
                </span>
              </div>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 700, lineHeight: 1.4, color: '#ffffff' }}>
              {selectedAnnouncement.title}
            </h3>

            {(selectedAnnouncement.created_at || selectedAnnouncement.createdAt) && (
              <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: '#64748b' }}>
                発行日時: {new Date(selectedAnnouncement.created_at || selectedAnnouncement.createdAt || '').toLocaleString('ja-JP')}
              </p>
            )}

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '13px',
                lineHeight: 1.6,
                color: '#cbd5e1',
                maxHeight: '360px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {selectedAnnouncement.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                style={{
                  padding: '8px 20px',
                  background: '#0ea5e9',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import { AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'critical';
  created_at: string;
}

export const GlobalAnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const res = await fetch('/api/announcements/active');
        if (res.ok) {
          const data = await res.json() as any;
          if (data.success && Array.isArray(data.announcements)) {
            setAnnouncements(data.announcements);
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

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => [...prev, id]);
  };

  const visibleAnnouncements = announcements.filter(a => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', zIndex: 9999 }}>
      {visibleAnnouncements.map(ann => {
        const isCritical = ann.type === 'critical';
        const isWarning = ann.type === 'warning';

        const bg = isCritical ? 'rgba(239, 68, 68, 0.9)' : isWarning ? 'rgba(245, 158, 11, 0.9)' : 'rgba(14, 165, 233, 0.9)';
        const textColor = '#ffffff';

        return (
          <div
            key={ann.id}
            style={{
              background: bg,
              color: textColor,
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: 500,
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              {isCritical ? <AlertTriangle size={16} /> : isWarning ? <AlertCircle size={16} /> : <Info size={16} />}
              <span style={{ fontWeight: 'bold' }}>[{ann.title}]</span>
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ann.content}</span>
            </div>
            <button
              onClick={() => handleDismiss(ann.id)}
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
        );
      })}
    </div>
  );
};

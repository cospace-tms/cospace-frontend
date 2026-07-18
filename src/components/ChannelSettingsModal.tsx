import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { apiClient } from '../utils/apiClient';
import { useLanguage } from '../utils/i18n';

interface ChannelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: {
    id: string;
    name: string;
    description?: string;
    isPrivate: boolean;
    type?: string;
    groupId?: string | null;
  } | null;
  currentUserRole: 'owner' | 'group_admin' | 'member' | 'guest';
  currentUserLedGroups: string[];
  currentUserId: string;
  currentUserDisplayName: string;
  onUpdateChannel: (name: string, description: string, isPrivate: boolean) => Promise<void>;
  onDeleteChannel: () => Promise<void>;
  onLeaveChannel: () => Promise<void>;
  isJoined: boolean;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  isOpen,
  onClose,
  channel,
  currentUserRole,
  currentUserLedGroups,
  currentUserId,
  currentUserDisplayName,
  onUpdateChannel,
  onDeleteChannel,
  onLeaveChannel,
  isJoined,
}) => {
  const { t } = useLanguage();
  const isEn = t('error') === 'Error';
  const [channelName, setChannelName] = useState(channel?.name || '');
  const [channelDescription, setChannelDescription] = useState(channel?.description || '');
  const [isPrivate, setIsPrivate] = useState(channel?.isPrivate || false);

  const isGeneral = channel?.name === 'general' && channel?.type !== 'dm';

  const handleLeaveClick = async () => {
    const isDm = channel?.type === 'dm';
    const msg = isDm 
      ? (isEn ? 'Are you sure you want to leave this direct message?' : '本当にこのダイレクトメッセージから退出しますか？')
      : (isEn ? `Are you sure you want to leave the channel "#${channel?.name}"?\nTo join again, you will need to re-enter from the channel browser.` : `本当にチャンネル「#${channel?.name}」から退出しますか？\n再度参加するには、チャンネルブラウザから入り直す必要があります。`);

    if (confirm(msg)) {
      try {
        await onLeaveChannel();
        alert(isDm ? (isEn ? 'Left DM.' : 'DMから退出しました。') : (isEn ? 'Left channel.' : 'チャンネルから退出しました。'));
        onClose();
      } catch (err: any) {
        alert((isEn ? 'Failed to leave: ' : '退出に失敗しました: ') + (err.message || err));
      }
    }
  };

  useEffect(() => {
    if (isOpen && channel) {
      setChannelName(channel.name);
      setChannelDescription(channel.description || '');
      setIsPrivate(channel.isPrivate);
    }
  }, [isOpen, channel]);

  if (!isOpen || !channel) return null;

  const isOwner = currentUserRole === 'owner';
  const isGroupLeader = channel.groupId && currentUserLedGroups.includes(channel.groupId);
  const canTogglePrivacy = isOwner || (currentUserRole === 'group_admin' && !!channel.groupId && currentUserLedGroups.includes(channel.groupId));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onUpdateChannel(channelName, channelDescription, isPrivate);
      alert(isEn ? 'Channel settings updated.' : 'チャンネル設定を更新しました。');
      onClose();
    } catch (err: any) {
      alert((isEn ? 'Failed to update channel: ' : 'チャンネルの更新に失敗しました: ') + (err.message || err));
    }
  };

  const handleDeleteClick = async () => {
    const isDm = channel.type === 'dm';
    const confirmMsg = isDm 
      ? (isEn ? 'Are you sure you want to delete this direct message history?\nThis action cannot be undone.' : '本当にこのダイレクトメッセージ履歴を削除しますか？\nこの操作は取り消せません。')
      : (isEn ? `Are you sure you want to delete the channel "#${channel.name}"?\nThis action cannot be undone.` : `本当にチャンネル「#${channel.name}」を削除しますか？\nこの操作は取り消せません。`);

    if (confirm(confirmMsg)) {
      try {
        await onDeleteChannel();
        alert(isEn ? 'Channel deleted.' : 'チャンネルを削除しました。');
        onClose();
      } catch (err: any) {
        alert((isEn ? 'Failed to delete channel: ' : 'チャンネルの削除に失敗しました: ') + (err.message || err));
      }
    }
  };

  const getDmDisplayName = (dmName: string): string => {
    const names = dmName.split(',').map((n) => n.trim());
    const filtered = names.filter((n) => n !== currentUserDisplayName);
    if (filtered.length === 0) return dmName;
    return filtered.join(', ');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" style={{ maxWidth: '480px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <style>{`
          .channel-settings-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-height: 520px;
            overflow-y: auto;
          }
          .settings-section {
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border-light);
          }
          .settings-section:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }
        `}</style>
        <div className="modal-header">
          <h2>{channel.type === 'dm' ? (isEn ? `DM: Settings for ${getDmDisplayName(channel.name)}` : `DM: ${getDmDisplayName(channel.name)} の設定`) : (isEn ? `Channel Settings: #${channel.name}` : `チャンネル設定: #${channel.name}`)}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body channel-settings-container">
          {/* 基本情報設定 */}
          <div className="settings-section settings-form-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <form onSubmit={handleSave} className="settings-form">
              {channel.type !== 'dm' && (
                <div className="form-group">
                  <label>{isEn ? 'Channel Name' : 'チャンネル名'}</label>
                  <input 
                    type="text" 
                    value={channelName} 
                    onChange={(e) => setChannelName(e.target.value)} 
                    required 
                    className="form-input" 
                  />
                </div>
              )}
              <div className="form-group">
                <label>{isEn ? 'Description' : '説明'}</label>
                <textarea 
                  value={channelDescription} 
                  onChange={(e) => setChannelDescription(e.target.value)} 
                  className="form-textarea" 
                  placeholder={channel.type === 'dm' ? (isEn ? 'DM description' : 'DMの説明') : (isEn ? 'Enter the purpose of this channel, etc.' : 'チャンネルの目的などを入力してください')}
                  style={{ minHeight: '80px' }}
                />
              </div>

              {channel.type !== 'dm' && (
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: canTogglePrivacy ? 'pointer' : 'default', fontWeight: '500' }}>
                    <input 
                      type="checkbox" 
                      checked={isPrivate} 
                      disabled={!canTogglePrivacy}
                      onChange={(e) => setIsPrivate(e.target.checked)} 
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
                    />
                    <span>{isEn ? 'Make this channel private' : 'このチャンネルをプライベートにする'}</span>
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {isEn ? 'Private channels can only be viewed by assigned members or group leaders.' : 'プライベートチャンネルは、アサインされたメンバーまたはグループリーダーのみが閲覧できます。'}
                  </span>
                </div>
              )}

              <button type="submit" className="submit-btn" style={{ marginTop: '8px' }}>{isEn ? 'Save' : '保存する'}</button>
            </form>
          </div>

          {/* 危険区域 */}
          <div className="settings-section danger-zone">
            <h3>{isEn ? 'Danger Zone' : '危険区域'}</h3>
            
            {/* 退出ボタン（general 以外 且つ 自身が参加済みの場合） */}
            {!isGeneral && isJoined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{isEn ? 'Leave this chat and remove it from the sidebar.' : 'このチャットからの参加を解除し、サイドバーから取り除きます。'}</p>
                <button onClick={handleLeaveClick} type="button" className="danger-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', border: '1px solid rgba(239, 68, 68, 0.2)', width: 'fit-content' }}>
                  <span>{channel.type === 'dm' ? (isEn ? 'Leave DM' : 'DMから退出する') : (isEn ? 'Leave Channel' : 'チャンネルから退出する')}</span>
                </button>
              </div>
            )}

            {/* 削除ボタン（owner 権限または、チャンネルグループリーダー） */}
            {(isOwner || isGroupLeader) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: !isGeneral && isJoined ? '1px solid rgba(255, 255, 255, 0.05)' : 'none', paddingTop: !isGeneral && isJoined ? '12px' : '0' }}>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{channel.type === 'dm' ? (isEn ? 'Delete direct message history.' : 'ダイレクトメッセージの履歴を削除します。') : (isEn ? 'Deleting the channel will permanently delete all message history.' : 'チャンネルを削除すると、すべてのメッセージ履歴が削除されます。')}</p>
                <button onClick={handleDeleteClick} type="button" className="danger-btn" style={{ width: 'fit-content' }}>
                  <Trash2 size={16} />
                  <span>{channel.type === 'dm' ? (isEn ? 'Delete DM' : 'DMを削除する') : (isEn ? 'Delete Channel' : 'チャンネルを削除する')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

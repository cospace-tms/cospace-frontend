import React, { useState, useEffect } from 'react';
import { 
  X, UserPlus, Shield, Trash2, Users, Sliders, Plus, Menu, Mail, Key, Loader, 
  ArrowUp, ArrowDown, Edit2, CreditCard, FileText, Download, AlertCircle, CheckCircle, ExternalLink
} from 'lucide-react';
import { WorkspaceGroupsTab } from './WorkspaceGroupsTab';
import { SmtpSettingsTab } from './SmtpSettingsTab';
import { apiClient } from '../utils/apiClient';
import { useLanguage } from '../utils/i18n';

interface Member {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'owner' | 'group_admin' | 'member' | 'guest';
  groupIds?: string[];
}

interface PublicPlan {
  id: string;
  name: string;
  member_limit: number;
  channel_limit: number;
  storage_limit: number;
  dm_enabled: number;
  media_enabled: number;
  forbidden_extensions: string;
  price_amount: number;
  price_currency: string;
}

interface WorkspaceAuditLog {
  id: string;
  user_id: string | null;
  userName: string | null;
  action: string;
  details: string;
  ip_address: string | null;
  created_at: string;
}

interface WorkspaceMembersModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  workspace: {
    id: string;
    name: string;
    custom_statuses?: string;
  } | null;
  currentUserRole: 'owner' | 'group_admin' | 'member' | 'guest';
  currentUserLedGroups: string[];
  onUpdateWorkspace: (name: string, customStatuses?: string) => Promise<void>;
  onDeleteWorkspace: () => Promise<void>;
  isEmbed?: boolean;
  onMenuClick?: () => void;
  extraTabs?: ExtraTab[];
  initialTab?: string;
  memberLimitReached?: boolean;
  memberLimitMessage?: string;
}

export interface ExtraTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  visible?: boolean;
}

export const WorkspaceMembersModal: React.FC<WorkspaceMembersModalProps> = ({
  isOpen,
  onClose,
  workspace,
  currentUserRole,
  currentUserLedGroups,
  onUpdateWorkspace,
  onDeleteWorkspace,
  isEmbed = false,
  onMenuClick,
  extraTabs,
  initialTab = 'members',
  memberLimitReached = false,
  memberLimitMessage,
}) => {
  const { t } = useLanguage();
  const isEn = t('error') === 'Error';

  // タブ管理
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // 各種ステート
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || '');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [customStatuses, setCustomStatuses] = useState<string[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [editingStatusIndex, setEditingStatusIndex] = useState<number | null>(null);
  const [editingStatusValue, setEditingStatusValue] = useState<string>('');

  // 一時パスワード発行ステート
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resettingUser, setResettingUser] = useState<Member | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // 新規メンバー招待ステート
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'group_admin' | 'member' | 'guest'>('member');
  const [addingMember, setAddingMember] = useState(false);

  const isOwner = currentUserRole === 'owner';
  const isGroupAdmin = currentUserRole === 'group_admin';
  const canAccessSettings = isOwner || isGroupAdmin;

  // メンバー一覧の取得
  const loadMembers = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: Member[] }>(
        `/api/workspaces/${workspace.id}/members`
      );
      if (res.success && Array.isArray(res.data)) {
        setMembers(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load workspace members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((isOpen || isEmbed) && workspace) {
      setWorkspaceName(workspace.name);
      const statuses = workspace.custom_statuses 
        ? workspace.custom_statuses.split(',').filter(Boolean)
        : ['todo', 'in_progress', 'done'];
      setCustomStatuses(statuses);
      loadMembers();
    }
  }, [isOpen, isEmbed, workspace]);

  if (!isEmbed && (!isOpen || !workspace)) return null;
  if (isEmbed && !workspace) return null;

  // ワークスペース変更処理
  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onUpdateWorkspace(workspaceName);
      alert(t('error') === 'Error' ? 'Workspace name updated.' : 'ワークスペース名を更新しました。');
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to update workspace name: ' : 'ワークスペース名の更新に失敗しました: ') + (err.message || err));
    }
  };

  const triggerStatusUpdate = async (newStatuses: string[]) => {
    try {
      await onUpdateWorkspace(workspaceName, newStatuses.join(','));
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to update statuses: ' : 'ステータスの更新に失敗しました: ') + (err.message || err));
    }
  };

  // ステータス並び替え
  const handleMoveStatus = (index: number, direction: 'up' | 'down') => {
    const newStatuses = [...customStatuses];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStatuses.length) return;

    const temp = newStatuses[index];
    newStatuses[index] = newStatuses[targetIndex];
    newStatuses[targetIndex] = temp;

    setCustomStatuses(newStatuses);
    triggerStatusUpdate(newStatuses);
  };

  const handleSaveStatusName = (index: number) => {
    const trimmed = editingStatusValue.trim();
    if (!trimmed) {
      setEditingStatusIndex(null);
      return;
    }

    const newStatuses = [...customStatuses];
    if (newStatuses.some((s, idx) => s === trimmed && idx !== index)) {
      alert(t('error') === 'Error' ? 'Status name already exists.' : '同じ名前のステータスが既に存在します。');
      return;
    }

    newStatuses[index] = trimmed;
    setCustomStatuses(newStatuses);
    setEditingStatusIndex(null);
    triggerStatusUpdate(newStatuses);
  };

  const handleAddStatus = () => {
    const trimmed = newStatusName.trim();
    if (!trimmed) return;
    if (customStatuses.includes(trimmed)) {
      alert(t('error') === 'Error' ? 'A status with the same name already exists.' : '同じ名前のステータスが既に存在します。');
      return;
    }
    const nextStatuses = [...customStatuses, trimmed];
    setCustomStatuses(nextStatuses);
    setNewStatusName('');
    triggerStatusUpdate(nextStatuses);
  };

  const handleRemoveStatus = (statusToRemove: string) => {
    if (customStatuses.length <= 1) {
      alert(t('error') === 'Error' ? 'Cannot delete all statuses. At least one status is required.' : 'すべてのステータスを削除することはできません。最低1つのステータスが必要です。');
      return;
    }
    const confirmMsg = t('error') === 'Error'
      ? `Delete status "${statusToRemove}"?\n(Existing tasks with this status will remain unchanged)`
      : `ステータス「${statusToRemove}」を削除しますか？\n（このステータスが設定された既存タスクはそのまま残ります）`;
    if (confirm(confirmMsg)) {
      const nextStatuses = customStatuses.filter(s => s !== statusToRemove);
      setCustomStatuses(nextStatuses);
      triggerStatusUpdate(nextStatuses);
    }
  };

  // メンバー追加・ロール変更・削除
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !workspace) return;
    setAddingMember(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: Member }>(
        `/api/workspaces/${workspace.id}/members`,
        { email: inviteEmail.trim(), role: inviteRole }
      );
      if (res.success && res.data) {
        setMembers(prev => [...prev, res.data]);
        setInviteEmail('');
        if (fetchSubscription && workspace) {
          fetchSubscription(workspace.id);
        }
        alert(t('error') === 'Error' ? 'Member added.' : 'メンバーを追加しました。');
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to add member: ' : 'メンバーの追加に失敗しました: ') + (err.message || err));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'owner' | 'group_admin' | 'member' | 'guest') => {
    if (!workspace) return;
    try {
      const res = await apiClient.put<{ success: boolean }>(
        `/api/workspaces/${workspace.id}/members/${userId}`,
        { role: newRole }
      );
      if (res.success) {
        setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: newRole } : m));
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to change role: ' : 'ロールの変更に失敗しました: ') + (err.message || err));
    }
  };

  const handleDeleteMember = async (userId: string, memberName: string) => {
    if (!workspace) return;
    const confirmMsg = t('error') === 'Error'
      ? `Are you sure you want to remove "${memberName}"?`
      : `本当に「${memberName}」を除外しますか？`;
    if (confirm(confirmMsg)) {
      try {
        const res = await apiClient.delete<{ success: boolean }>(
          `/api/workspaces/${workspace.id}/members/${userId}`
        );
        if (res.success) {
          setMembers(prev => prev.filter(m => m.userId !== userId));
          if (fetchSubscription && workspace) {
            fetchSubscription(workspace.id);
          }
        }
      } catch (err: any) {
        alert((t('error') === 'Error' ? 'Failed to remove member: ' : 'メンバーの除外に失敗しました: ') + (err.message || err));
      }
    }
  };

  const handleResetPassword = async (targetMember: Member) => {
    if (!workspace) return;
    const confirmMsg = t('error') === 'Error'
      ? `Issue a temporary password for "${targetMember.displayName}"?`
      : `「${targetMember.displayName}」の一時パスワードを発行しますか？`;
    if (!confirm(confirmMsg)) return;

    setResetLoading(true);
    setTempPassword(null);
    setResettingUser(targetMember);

    try {
      const res = await apiClient.post<{ success: boolean; tempPassword: string }>(
        `/api/workspaces/${workspace.id}/members/${targetMember.userId}/reset-password`
      );
      if (res.success && res.tempPassword) {
        setTempPassword(res.tempPassword);
      }
    } catch (err: any) {
      alert("失敗しました: " + (err.message || err));
      setResettingUser(null);
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteWorkspaceClick = async () => {
    if (!workspace) return;
    const confirmMsg = t('error') === 'Error'
      ? `Are you sure you want to delete workspace "${workspace.name}"?`
      : `本当にワークスペース「${workspace.name}」を削除しますか？`;
    if (confirm(confirmMsg)) {
      try {
        await onDeleteWorkspace();
        onClose?.();
      } catch (err: any) {
        alert("削除に失敗しました: " + (err.message || err));
      }
    }
  };

  const canModifyMember = (targetMember: Member): boolean => {
    if (targetMember.userId === apiClient.getUserId()) return false;
    if (isOwner) return true;
    if (isGroupAdmin) {
      if (targetMember.role === 'owner') return false;
      const memberGroupIds = targetMember.groupIds || [];
      return memberGroupIds.some(gid => currentUserLedGroups.includes(gid));
    }
    return false;
  };





  // タブ描画処理
  const renderMembersTab = () => {
    return (
      <div className="settings-form-wrapper">
        {/* ワークスペース名変更（管理者のみ） */}
        <div className="settings-section" style={{ paddingBottom: '20px', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>{t('workspace.general')}</h3>
          <form onSubmit={handleUpdateName} className="settings-form-row-responsive">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>{t('setup.workspaceName')}</label>
              <input 
                type="text" 
                value={workspaceName} 
                onChange={(e) => setWorkspaceName(e.target.value)} 
                required 
                className="form-input" 
                disabled={!isOwner}
              />
            </div>
            {isOwner && <button type="submit" className="submit-btn" style={{ padding: '11px 20px' }}>{t('workspace.rename')}</button>}
          </form>
        </div>

        {/* 招待（オーナーのみ） */}
        {isOwner && (
          <div className="settings-section" style={{ paddingBottom: '20px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>{t('workspace.invite')}</h3>
            {memberLimitReached ? (
              <div style={{
                padding: '12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                fontSize: '13px',
                lineHeight: '1.5'
              }}>
                {memberLimitMessage || (t('error') === 'Error'
                  ? 'Workspace member limit reached. Please upgrade to invite more members.'
                  : 'メンバー上限に達しました。さらにメンバーを招待するには、プランをアップグレードしてください。')}
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="settings-form-row-responsive">
                <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                  <label>{t('profile.email')}</label>
                  <input 
                    type="email" 
                    value={inviteEmail} 
                    onChange={(e) => setInviteEmail(e.target.value)} 
                    placeholder="user@example.com"
                    required 
                    className="form-input" 
                    disabled={addingMember}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>{t('error') === 'Error' ? 'Role' : 'ロール'}</label>
                  <select 
                    value={inviteRole} 
                    onChange={(e) => setInviteRole(e.target.value as any)} 
                    className="form-input"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                    disabled={addingMember}
                  >
                    <option value="member">{t('workspace.role.member')}</option>
                    <option value="guest">{t('workspace.role.guest')}</option>
                    <option value="group_admin">{t('workspace.role.groupAdmin')}</option>
                    <option value="owner">{t('workspace.role.owner')}</option>
                  </select>
                </div>
                <button type="submit" className="submit-btn" style={{ padding: '11px 20px', display: 'flex', alignItems: 'center', gap: '6px' }} disabled={addingMember}>
                  {addingMember ? <Loader className="animate-spin" size={16} /> : <UserPlus size={16} />}
                  <span>{addingMember ? t('workspace.inviting') : t('workspace.add')}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* メンバー一覧 */}
        <div className="settings-section" style={{ paddingBottom: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>{t('workspace.memberList')} ({members.length})</h3>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{t('loading')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
              {members.map((member) => {
                const modifiable = canModifyMember(member);
                return (
                  <div key={member.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '12px', overflow: 'hidden' }}>
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl.startsWith('http') ? member.avatarUrl : `http://127.0.0.1:8787${member.avatarUrl}`} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          member.displayName.substring(0, 1).toUpperCase()
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{member.displayName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{member.email}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {modifiable ? (
                        <select 
                          value={member.role} 
                          onChange={(e) => handleRoleChange(member.userId, e.target.value as any)} 
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '12px', width: 'auto', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                        >
                          {isOwner && <option value="owner">{t('workspace.role.owner')}</option>}
                          <option value="group_admin">{t('workspace.role.groupAdmin')}</option>
                          <option value="member">{t('workspace.role.member')}</option>
                          <option value="guest">{t('workspace.role.guest')}</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Shield size={12} />
                          <span>{member.role.toUpperCase()}</span>
                        </span>
                      )}

                      {modifiable && (
                        <button onClick={() => handleResetPassword(member)} className="submit-btn" style={{ padding: '6px', borderRadius: '4px', background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5', border: 'none', margin: 0, height: 'auto', display: 'flex', alignItems: 'center' }} title="一時パスワードを発行">
                          <Key size={14} />
                        </button>
                      )}

                      {modifiable && (
                        <button onClick={() => handleDeleteMember(member.userId, member.displayName)} className="danger-btn" style={{ padding: '6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-danger)', border: 'none', margin: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ワークスペース削除 */}
        {isOwner && (
          <div className="danger-zone">
            <h3>{t('workspace.dangerZone')}</h3>
            <p>{t('workspace.deleteText')}</p>
            <button onClick={handleDeleteWorkspaceClick} type="button" className="danger-btn">
              <Trash2 size={16} />
              <span>{t('workspace.deleteBtn')}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderStatusesTab = () => {
    return (
      <div className="settings-form-wrapper">
        <div className="settings-section">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{t('workspace.statusTitle')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>{t('workspace.statusHelp')}</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input type="text" value={newStatusName} onChange={(e) => setNewStatusName(e.target.value)} placeholder="todo" className="form-input" style={{ flex: 1, marginBottom: 0 }} />
            <button type="button" onClick={handleAddStatus} className="submit-btn" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 16px' }}><Plus size={14} /><span>{t('workspace.add')}</span></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {customStatuses.map((status, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
                <span style={{ fontSize: '13px' }}>{status}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleMoveStatus(index, 'up')} disabled={index === 0} style={{ padding: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}><ArrowUp size={14} /></button>
                  <button onClick={() => handleMoveStatus(index, 'down')} disabled={index === customStatuses.length - 1} style={{ padding: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}><ArrowDown size={14} /></button>
                  <button onClick={() => handleRemoveStatus(status)} style={{ padding: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--accent-danger)' }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };



  const settingsContent = (
    <div className={isEmbed ? "workspace-settings-embed" : "modal-content settings-modal"} style={isEmbed ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', padding: '24px', overflowY: 'auto' } : { maxWidth: activeTab === 'groups' ? '750px' : '650px', transition: 'max-width 0.2s' }} onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isEmbed && onMenuClick && (
            <button className="mobile-menu-trigger" onClick={onMenuClick} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <Menu size={20} />
            </button>
          )}
          <h2>{t('workspace.mgmt')}</h2>
        </div>
        {!isEmbed && onClose && (
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* タブ切り替えバー */}
      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
          <Shield size={16} />
          <span>{t('workspace.members')}</span>
        </button>
        {canAccessSettings && (
          <button className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
            <Users size={16} />
            <span>{t('workspace.groups')}</span>
          </button>
        )}
        {isOwner && (
          <button className={`tab-btn ${activeTab === 'statuses' ? 'active' : ''}`} onClick={() => setActiveTab('statuses')}>
            <Sliders size={16} />
            <span>{t('workspace.statuses')}</span>
          </button>
        )}
        {isOwner && (
          <button className={`tab-btn ${activeTab === 'smtp' ? 'active' : ''}`} onClick={() => setActiveTab('smtp')}>
            <Mail size={16} />
            <span>{t('workspace.smtp')}</span>
          </button>
        )}
        {extraTabs && extraTabs.map(tab => {
          if (tab.visible === false) return null;
          return (
            <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="settings-body" style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'members' ? (
          renderMembersTab()
        ) : activeTab === 'groups' ? (
          <WorkspaceGroupsTab workspaceId={workspace!.id} workspaceMembers={members} currentUserRole={currentUserRole} currentUserLedGroups={currentUserLedGroups} />
        ) : activeTab === 'statuses' ? (
          renderStatusesTab()
        ) : activeTab === 'smtp' ? (
          isOwner && <SmtpSettingsTab />
        ) : (
          extraTabs && extraTabs.find(tab => tab.id === activeTab)?.content
        )}
      </div>

      {/* パスワードリセット一時パスワードポップアップ */}
      {tempPassword && resettingUser && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10001, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setTempPassword(null); setResettingUser(null); }}>
          <div className="modal-content settings-modal" style={{ maxWidth: '420px', textAlign: 'center', padding: '24px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: '8px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>{t('workspace.tempPwIssued')}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '15px', lineHeight: '1.5' }}>
              ユーザー {resettingUser.displayName} の新しい一時パスワードです。コピーしてユーザーに伝えてください。
            </p>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px', fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace', marginBottom: '20px', color: 'var(--accent-primary)', userSelect: 'all' }}>
              {tempPassword}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: '10px' }} onClick={() => { navigator.clipboard.writeText(tempPassword || ''); alert('コピーしました。'); }}>{t('workspace.copy')}</button>
              <button className="btn btn-secondary" style={{ flex: 0.5, padding: '10px' }} onClick={() => { setTempPassword(null); setResettingUser(null); }}>{t('workspace.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isEmbed) {
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', minWidth: 0 }}>
        <div className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
          <div className="chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              {onMenuClick && (
                <button className="mobile-menu-trigger" onClick={onMenuClick} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', display: 'flex', alignItems: 'center', marginRight: '8px' }}>
                  <Menu size={20} />
                </button>
              )}
              <h1 className="channel-info-title" style={{ margin: 0 }}>{t('workspace.mgmt')}</h1>
            </div>
          </div>

          <div className="settings-tabs" style={{ marginTop: 0 }}>
            <button className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
              <Shield size={16} />
              <span>{t('workspace.members')}</span>
            </button>
            {canAccessSettings && (
              <button className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
                <Users size={16} />
                <span>{t('workspace.groups')}</span>
              </button>
            )}
            {isOwner && (
              <button className={`tab-btn ${activeTab === 'statuses' ? 'active' : ''}`} onClick={() => setActiveTab('statuses')}>
                <Sliders size={16} />
                <span>{t('workspace.statuses')}</span>
              </button>
            )}
            {isOwner && (
              <button className={`tab-btn ${activeTab === 'smtp' ? 'active' : ''}`} onClick={() => setActiveTab('smtp')}>
                <Mail size={16} />
                <span>{t('workspace.smtp')}</span>
              </button>
            )}
            {extraTabs && extraTabs.map(tab => {
              if (tab.visible === false) return null;
              return (
                <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {activeTab === 'members' && renderMembersTab()}
            {activeTab === 'groups' && workspace && (
              <WorkspaceGroupsTab workspaceId={workspace.id} workspaceMembers={members} currentUserRole={currentUserRole} currentUserLedGroups={currentUserLedGroups} />
            )}
            {activeTab === 'statuses' && renderStatusesTab()}
            {activeTab === 'smtp' && workspace && <SmtpSettingsTab />}
            {extraTabs && extraTabs.find(tab => tab.id === activeTab)?.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      {settingsContent}
    </div>
  );
};

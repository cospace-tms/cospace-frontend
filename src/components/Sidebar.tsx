import React, { useState, useEffect, useRef } from 'react';
import { Hash, Plus, Settings, Inbox, User, LogOut, MoreHorizontal, Lock, MessageCircle, Globe, CheckSquare, ToggleLeft, ChevronRight, ChevronLeft, ChevronDown, BookOpen, Image, Sun, Moon, Home, Menu, Star, Search, Users, Check } from 'lucide-react';
import { useLanguage } from '../utils/i18n';
import { getApiUrl } from '../utils/apiUrl';

interface Group {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount: number;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  groupId?: string | null;
  type?: string;
  unreadCount?: number;
  isStarred?: boolean;
}

interface Workspace {
  id: string;
  name: string;
}

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  channels: Channel[];
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  activeView: 'dashboard' | 'chat' | 'items' | 'inbox' | 'workspace_doc' | 'media' | 'workspace_settings' | 'search' | 'workspace_members';
  setActiveView: (view: 'dashboard' | 'chat' | 'items' | 'inbox' | 'workspace_doc' | 'media' | 'workspace_settings' | 'search' | 'workspace_members') => void;
  unreadNotificationsCount: number;
  channelUnreads: Record<string, boolean>;
  currentUser: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string | null;
    language?: string;
  } | null;
  currentUserRole: 'owner' | 'group_admin' | 'member' | 'guest';
  currentUserLedGroups: string[];
  groups?: Group[];
  onLogout?: () => void;
  onOpenUserProfile?: () => void;
  onOpenWorkspaceMembers?: (initialTab?: 'members' | 'groups' | 'general' | 'statuses' | 'smtp' | 'subscription') => void;
  onOpenChannelSettings?: (channel: Channel) => void;
  onOpenCreateWorkspace?: () => void;
  onOpenCreateChannel?: (defaultGroupId?: string) => void;
  onOpenBrowseChannels?: () => void;
  onOpenStartDm?: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onToggleStarChannel?: (channelId: string, currentStarred: boolean) => Promise<void>;
  subscription?: {
    plan: string;
    planName?: string;
    storageLimit: number;
    storageUsed: number;
    memberLimit: number;
    memberUsed: number;
    channelLimit: number;
    channelUsed: number;
    dmEnabled?: boolean;
    mediaEnabled?: boolean;
  } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  workspaces,
  activeWorkspaceId,
  setActiveWorkspaceId,
  channels,
  activeChannelId,
  setActiveChannelId,
  activeView,
  setActiveView,
  unreadNotificationsCount,
  channelUnreads,
  currentUser,
  currentUserRole,
  currentUserLedGroups,
  groups = [],
  onLogout,
  onOpenUserProfile,
  onOpenWorkspaceMembers,
  onOpenChannelSettings,
  onOpenCreateWorkspace,
  onOpenCreateChannel,
  onOpenBrowseChannels,
  onOpenStartDm,
  isCollapsed,
  setIsCollapsed,
  onToggleStarChannel,
  subscription,
}) => {
  const { t } = useLanguage();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [isWsListExpanded, setIsWsListExpanded] = useState(false);
  const [isChannelsExpanded, setIsChannelsExpanded] = useState(true);
  const [isDmsExpanded, setIsDmsExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const closeMobileMenuIfNeeded = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setIsCollapsed(true);
    }
  };

  // ポップオーバー外クリック（Click Outside）検知用のRef
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // ワークスペースメニューの外側をクリックした場合は閉じる
      if (showWorkspaceMenu && workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setShowWorkspaceMenu(false);
      }
      // ユーザーメニューの外側をクリックした場合は閉じる
      if (showUserMenu && userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showWorkspaceMenu, showUserMenu]);

  const isOwner = currentUserRole === 'owner';
  const isGroupAdmin = currentUserRole === 'group_admin';

  const starredChannels = channels.filter(c => {
    if (subscription?.dmEnabled === false && c.type === 'dm') {
      return false;
    }
    return c.isStarred;
  });



  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${(showUserMenu || showWorkspaceMenu) ? 'popover-open' : ''}`}>
      {/* 1. チャンネル・ユーザー情報列 (全体一列) */}
      <div className="channel-column" style={{ padding: '16px 0 0', minWidth: isCollapsed ? 'auto' : '240px', width: isCollapsed ? 'auto' : '240px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* 最上部：ロゴ ＆ コラプストグル */}
        {!isCollapsed ? (
          <div style={{ padding: '0 16px 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', marginBottom: '16px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
              CoHive
            </span>
            <button
              className="input-icon-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(true);
              }}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={t('error') === 'Error' ? 'Minimize menu' : 'メニューを最小化'}
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border-light)', marginBottom: '16px' }}>
            <button
              className="input-icon-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(false);
              }}
              style={{ color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={t('error') === 'Error' ? 'Expand menu' : 'メニューを展開'}
            >
              <Menu size={16} />
            </button>
          </div>
        )}

        {/* グローバル機能 (ホーム、受信箱) - ゲスト以外 */}
        {currentUserRole !== 'guest' && (
          <ul className="channel-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px', padding: isCollapsed ? '0 4px' : '0 8px' }}>
            {/* ダッシュボード */}
            <li
              className={`channel-item ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('dashboard');
                setActiveChannelId(null);
                closeMobileMenuIfNeeded();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '8px', cursor: 'pointer', paddingLeft: isCollapsed ? '0' : '12px', paddingRight: isCollapsed ? '0' : '8px' }}
              title={t('error') === 'Error' ? 'Dashboard' : 'ダッシュボード'}
            >
              <Home size={16} style={{ flexShrink: 0 }} />
              {!isCollapsed && <span style={{ fontWeight: 'bold' }}>{t('error') === 'Error' ? 'Dashboard' : 'ダッシュボード'}</span>}
            </li>
            <li
              className={`channel-item ${activeView === 'inbox' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('inbox');
                setActiveChannelId(null);
                closeMobileMenuIfNeeded();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', cursor: 'pointer', paddingLeft: isCollapsed ? '0' : '12px', paddingRight: isCollapsed ? '0' : '8px', position: 'relative' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <Inbox size={16} style={{ flexShrink: 0 }} />
                {!isCollapsed && <span style={{ fontWeight: 'bold' }}>{t('sidebar.inbox')}</span>}
                {isCollapsed && unreadNotificationsCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'var(--accent-danger)',
                    color: '#fff',
                    fontSize: '8px',
                    padding: '1px 4px',
                    borderRadius: '5px',
                    fontWeight: 'bold',
                    lineHeight: '1'
                  }}>
                    {unreadNotificationsCount}
                  </span>
                )}
              </div>
              {!isCollapsed && unreadNotificationsCount > 0 && (
                <span style={{
                  background: 'var(--accent-danger)',
                  color: '#fff',
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  lineHeight: '1.2'
                }}>
                  {unreadNotificationsCount}
                </span>
              )}
            </li>

            {/* 全文検索 */}
            <li
              className={`channel-item ${activeView === 'search' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('search');
                setActiveChannelId(null);
                closeMobileMenuIfNeeded();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '8px', cursor: 'pointer', paddingLeft: isCollapsed ? '0' : '12px', paddingRight: isCollapsed ? '0' : '12px' }}
            >
              <Search size={16} style={{ flexShrink: 0 }} />
              {!isCollapsed && <span style={{ fontWeight: 'bold' }}>{t('error') === 'Error' ? 'Search' : '検索'}</span>}
            </li>
          </ul>
        )}

        {/* 統合型ワークスペースヘッダー ＆ 切替トグル */}
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: isCollapsed ? '12px' : '8px', alignItems: isCollapsed ? 'center' : 'stretch', padding: isCollapsed ? '16px 0 0' : '16px 16px 12px', borderTop: '1px solid var(--border-light)', borderBottom: 'none', marginBottom: '4px' }}>
          {!isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* 統合ヘッダーバー (現在WS名 + 展開トグル + 設定アイコン) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                {/* クリックでトグル開閉するメインエリア */}
                <button
                  type="button"
                  onClick={() => setIsWsListExpanded(!isWsListExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: 0,
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    color: 'var(--text-primary)'
                  }}
                  title={t('error') === 'Error' ? 'Switch workspace' : 'ワークスペースを切り替え'}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    flexShrink: 0
                  }}>
                    {activeWorkspace?.name ? activeWorkspace.name.substring(0, 2).toUpperCase() : 'WS'}
                  </div>

                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                    {activeWorkspace?.name || 'Workspace'}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {(() => {
                      const hasOtherUnread = workspaces.some((ws: any) => ws.id !== activeWorkspaceId && ws.unreadCount > 0);
                      if (hasOtherUnread) {
                        return (
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-danger)',
                            display: 'inline-block'
                          }} title="他のワークスペースに未読があります"></span>
                        );
                      }
                      return null;
                    })()}
                    {isWsListExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {/* 設定ボタン */}
                {onOpenWorkspaceMembers && (currentUserRole === 'owner' || currentUserRole === 'group_admin') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenWorkspaceMembers('general');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginLeft: '4px'
                    }}
                    title={t('sidebar.settings')}
                  >
                    <Settings size={16} />
                  </button>
                )}
              </div>

              {/* トグル展開時のワークスペース一覧 ＆ 新規作成ボタン */}
              {isWsListExpanded && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  padding: '6px',
                  background: 'var(--bg-panel, rgba(0,0,0,0.15))',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  marginTop: '2px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px 2px', letterSpacing: '0.5px' }}>
                    {t('error') === 'Error' ? 'Workspaces' : 'ワークスペース一覧'}
                  </div>

                  {workspaces.map((ws: any) => {
                    const isActive = ws.id === activeWorkspaceId;
                    const hasUnread = ws.unreadCount > 0;
                    return (
                      <div
                        key={ws.id}
                        onClick={() => {
                          setActiveWorkspaceId(ws.id);
                          setIsWsListExpanded(false);
                          closeMobileMenuIfNeeded();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(var(--primary-color-rgb, 100, 108, 255), 0.15)' : 'transparent',
                          color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                          fontWeight: isActive ? 'bold' : 'normal',
                          fontSize: '13px',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.05))';
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <div style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '4px',
                            background: isActive ? 'var(--accent-primary)' : 'var(--border-light)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            flexShrink: 0
                          }}>
                            {ws.name ? ws.name.substring(0, 2).toUpperCase() : 'WS'}
                          </div>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ws.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {hasUnread && (
                            <span style={{
                              background: 'var(--accent-danger)',
                              color: '#fff',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '10px',
                              fontWeight: 'bold'
                            }}>
                              {ws.unreadCount}
                            </span>
                          )}
                          {isActive && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
                        </div>
                      </div>
                    );
                  })}

                  {/* ワークスペース作成ボタン (トグル内最下部) */}
                  {currentUserRole !== 'guest' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsWsListExpanded(false);
                        onOpenCreateWorkspace?.();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px',
                        marginTop: '4px',
                        borderTop: '1px dashed var(--border-light)',
                        background: 'none',
                        borderLeft: 'none',
                        borderRight: 'none',
                        borderBottom: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        borderRadius: '0 0 6px 6px',
                        transition: 'opacity 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                    >
                      <Plus size={14} />
                      <span>{t('sidebar.addWorkspace')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div ref={workspaceMenuRef} style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setShowWorkspaceMenu(!showWorkspaceMenu);
                  setShowUserMenu(false);
                }}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                title={activeWorkspace?.name || 'Workspace'}
              >
                {activeWorkspace?.name ? activeWorkspace.name.substring(0, 2).toUpperCase() : 'WS'}
              </button>
              {(() => {
                const hasOtherUnread = workspaces.some((ws: any) => ws.id !== activeWorkspaceId && ws.unreadCount > 0);
                if (hasOtherUnread) {
                  return (
                    <span style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-danger)',
                      border: '1.5px solid var(--bg-sidebar)',
                      pointerEvents: 'none'
                    }}></span>
                  );
                }
                return null;
              })()}

              {/* ワークスペース切り替えポップオーバーメニュー */}
              {showWorkspaceMenu && (
                <div 
                  className="workspace-popover-menu" 
                  style={{ 
                    position: 'absolute', 
                    top: '0', 
                    left: '46px', 
                    zIndex: 100, 
                    background: 'var(--bg-sidebar)', 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px', 
                    padding: '12px 0', 
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    minWidth: '220px'
                  }}
                >
                  {/* A. 上部: ワークスペース名を表示 */}
                  <div style={{ padding: '0 12px 8px', borderBottom: '1px solid var(--border-light)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {activeWorkspace?.name || 'Workspace'}
                    </span>
                    {onOpenWorkspaceMembers && (currentUserRole === 'owner' || currentUserRole === 'group_admin') && (
                      <button
                        onClick={() => {
                          onOpenWorkspaceMembers('general');
                          setShowWorkspaceMenu(false);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        title={t('sidebar.settings')}
                      >
                        <Settings size={14} />
                      </button>
                    )}
                  </div>

                  {/* B. その下: 各機能のアイコンを横並びで配置 */}
                  {currentUserRole !== 'guest' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 12px 10px', borderBottom: '1px solid var(--border-light)', marginBottom: '8px' }}>
                      {/* ドキュメント */}
                      <button
                        onClick={() => {
                          setActiveView('workspace_doc');
                          setActiveChannelId(null);
                          setShowWorkspaceMenu(false);
                          closeMobileMenuIfNeeded();
                        }}
                        style={{
                          background: activeView === 'workspace_doc' ? 'var(--bg-active)' : 'transparent',
                          border: 'none',
                          color: activeView === 'workspace_doc' ? 'var(--accent-primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title={t('sidebar.workspaceDoc')}
                      >
                        <BookOpen size={18} />
                      </button>

                      {/* タスク */}
                      <button
                        onClick={() => {
                          setActiveView('items');
                          setActiveChannelId(null);
                          setShowWorkspaceMenu(false);
                          closeMobileMenuIfNeeded();
                        }}
                        style={{
                          background: activeView === 'items' ? 'var(--bg-active)' : 'transparent',
                          border: 'none',
                          color: activeView === 'items' ? 'var(--accent-primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title={t('error') === 'Error' ? 'Tasks & Schedule' : 'タスク・予定'}
                      >
                        <CheckSquare size={18} />
                      </button>

                      {/* メディア */}
                      {subscription?.mediaEnabled !== false && (
                        <button
                          onClick={() => {
                            setActiveView('media');
                            setActiveChannelId(null);
                            setShowWorkspaceMenu(false);
                            closeMobileMenuIfNeeded();
                          }}
                          style={{
                            background: activeView === 'media' ? 'var(--bg-active)' : 'transparent',
                            border: 'none',
                            color: activeView === 'media' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title={t('sidebar.mediaLibrary')}
                        >
                          <Image size={18} />
                        </button>
                      )}

                      {/* メンバー */}
                      {onOpenWorkspaceMembers && (
                        <button
                          onClick={() => {
                            onOpenWorkspaceMembers('members');
                            setShowWorkspaceMenu(false);
                            closeMobileMenuIfNeeded();
                          }}
                          style={{
                            background: activeView === 'workspace_members' ? 'var(--bg-active)' : 'transparent',
                            border: 'none',
                            color: activeView === 'workspace_members' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title={t('sidebar.members')}
                        >
                          <Users size={18} />
                        </button>
                      )}


                    </div>
                  )}

                  {/* C. その下: ワークスペース切り替えと「＋」ボタンインライン配置 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 4px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    <span>{t('error') === 'Error' ? 'Switch Workspace' : 'ワークスペース切り替え'}</span>
                    {currentUserRole !== 'guest' && onOpenCreateWorkspace && (
                      <button
                        onClick={() => {
                          onOpenCreateWorkspace();
                          setShowWorkspaceMenu(false);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: 0
                        }}
                        title={t('sidebar.addWorkspace')}
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {workspaces.map((ws: any) => {
                      const isActive = ws.id === activeWorkspaceId;
                      return (
                        <button
                          key={ws.id}
                          onClick={() => {
                            setActiveWorkspaceId(ws.id);
                            setShowWorkspaceMenu(false);
                            closeMobileMenuIfNeeded();
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '8px 12px',
                            background: isActive ? 'var(--bg-active)' : 'none',
                            border: 'none',
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: isActive ? 'bold' : 'normal',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.background = 'none';
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                            {ws.name}
                          </span>
                          {ws.unreadCount > 0 && (
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--accent-danger)',
                              display: 'inline-block',
                              flexShrink: 0
                            }}></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* スクロール可能なサイドバーメインエリア */}
        <div className="sidebar-scrollable-area">
          {/* ワークスペースメニュー（通常時アイコン横並び、最小化時縦並び） - ゲスト以外 */}
          {currentUserRole !== 'guest' && (!isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 16px 12px' }}>
              {/* アイコン横並び行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                {/* ドキュメント */}
                <button
                  onClick={() => {
                    setActiveView('workspace_doc');
                    setActiveChannelId(null);
                    closeMobileMenuIfNeeded();
                  }}
                  className={`sidebar-icon-btn ${activeView === 'workspace_doc' ? 'active' : ''}`}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: activeView === 'workspace_doc' ? 'var(--bg-active)' : 'transparent',
                    border: '1px solid ' + (activeView === 'workspace_doc' ? 'var(--border-focus)' : 'var(--border-light)'),
                    color: activeView === 'workspace_doc' ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                  }}
                  title={t('sidebar.workspaceDoc')}
                >
                  <BookOpen size={18} />
                </button>

                {/* タスク */}
                <button
                  onClick={() => {
                    setActiveView('items');
                    setActiveChannelId(null);
                    closeMobileMenuIfNeeded();
                  }}
                  className={`sidebar-icon-btn ${activeView === 'items' ? 'active' : ''}`}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: activeView === 'items' ? 'var(--bg-active)' : 'transparent',
                    border: '1px solid ' + (activeView === 'items' ? 'var(--border-focus)' : 'var(--border-light)'),
                    color: activeView === 'items' ? 'var(--accent-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                  }}
                  title={t('error') === 'Error' ? 'Tasks & Schedule' : 'タスク・予定'}
                >
                  <CheckSquare size={18} />
                </button>

                {/* メディア */}
                {subscription?.mediaEnabled !== false && (
                  <button
                    onClick={() => {
                      setActiveView('media');
                      setActiveChannelId(null);
                      closeMobileMenuIfNeeded();
                    }}
                    className={`sidebar-icon-btn ${activeView === 'media' ? 'active' : ''}`}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: activeView === 'media' ? 'var(--bg-active)' : 'transparent',
                      border: '1px solid ' + (activeView === 'media' ? 'var(--border-focus)' : 'var(--border-light)'),
                      color: activeView === 'media' ? 'var(--accent-primary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                    }}
                    title={t('sidebar.mediaLibrary')}
                  >
                    <Image size={18} />
                  </button>
                )}

                {/* メンバー */}
                {onOpenWorkspaceMembers && (
                  <button
                    onClick={() => {
                      setActiveView('workspace_members');
                      setActiveChannelId(null);
                      closeMobileMenuIfNeeded();
                    }}
                    className={`sidebar-icon-btn ${activeView === 'workspace_members' ? 'active' : ''}`}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: activeView === 'workspace_members' ? 'var(--bg-active)' : 'transparent',
                      border: '1px solid ' + (activeView === 'workspace_members' ? 'var(--border-focus)' : 'var(--border-light)'),
                      color: activeView === 'workspace_members' ? 'var(--accent-primary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      outline: 'none',
                    }}
                    title={t('sidebar.members')}
                  >
                    <Users size={18} />
                  </button>
                )}
              </div>

            </div>
          ) : null)}

          {/* お気に入り（Starred）セクション */}
          {starredChannels.length > 0 && (
            <div className="sidebar-section" style={{ padding: isCollapsed ? '0 4px' : '0 8px', marginBottom: '12px' }}>
              {!isCollapsed ? (
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-warning, #f59e0b)' }}>
                  <Star size={14} fill="var(--accent-warning, #f59e0b)" />
                  <span>{t('error') === 'Error' ? 'Starred' : 'お気に入り'}</span>
                </div>
              ) : (
                <div style={{ borderBottom: '1px solid var(--border-light)', margin: '8px 0' }} />
              )}
              <ul className="channel-list">
                {starredChannels.map((channel) => {
                  const isActive = channel.id === activeChannelId;
                  const hasUnread = channelUnreads[channel.id];
                  const dmDisplayName = channel.type === 'dm' && currentUser
                    ? channel.name.split(',').map(n => n.trim()).filter(n => n !== currentUser.displayName).join(', ')
                    : channel.name;

                  const canEditChannel = (): boolean => {
                    if (channel.type === 'dm') return false;
                    if (isOwner) return true;
                    if (isGroupAdmin && channel.groupId) {
                      return currentUserLedGroups.includes(channel.groupId);
                    }
                    return false;
                  };

                  return (
                    <li
                      key={channel.id}
                      className={`channel-item ${(isActive && activeView === 'chat') ? 'active' : ''}`}
                      onClick={() => {
                        setActiveChannelId(channel.id);
                        setActiveView('chat');
                        closeMobileMenuIfNeeded();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        paddingLeft: isCollapsed ? '0' : '12px',
                        paddingRight: isCollapsed ? '0' : '8px',
                        fontWeight: hasUnread ? '700' : '500',
                        color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                        position: 'relative'
                      }}
                      title={isCollapsed ? dmDisplayName : undefined}
                    >
                      {isCollapsed ? (
                        <div 
                          className="channel-initial-avatar" 
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)',
                            color: isActive ? '#fff' : 'var(--accent-warning, #f59e0b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--accent-warning, #f59e0b)'
                          }}
                        >
                          {dmDisplayName.substring(0, 1).toUpperCase()}
                          {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                            <span className="channel-unread-badge collapsed">
                              {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
                            </span>
                          ) : (hasUnread && !isActive && (
                            <span style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: 'var(--primary-color)',
                              border: '1px solid var(--bg-sidebar)'
                            }}></span>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {channel.type === 'dm' ? (
                              <MessageCircle size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                            ) : channel.isPrivate ? (
                              <Lock size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                            ) : (
                              <Hash size={16} style={{ flexShrink: 0 }} />
                            )}
                            <span>{dmDisplayName}</span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                            {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive && (
                              <span className="channel-unread-badge">
                                {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onToggleStarChannel?.(channel.id, true)}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-warning, #f59e0b)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                              title="お気に入りから外す"
                            >
                              <Star size={14} fill="var(--accent-warning, #f59e0b)" />
                            </button>
                            {canEditChannel() && onOpenChannelSettings && (
                              <button
                                className="channel-menu-btn"
                                type="button"
                                onClick={() => {
                                  onOpenChannelSettings(channel);
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: isActive ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px' }}
                                title="チャンネル設定"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* チャンネル一覧セクション */}
          <div className="sidebar-section" style={{ padding: isCollapsed ? '0 4px' : '0 8px' }}>
            {!isCollapsed ? (
              <div 
                className="section-title"
                onClick={() => setIsChannelsExpanded(!isChannelsExpanded)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ChevronRight 
                    size={14} 
                    style={{ 
                      transform: isChannelsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      color: 'var(--text-muted)',
                      flexShrink: 0
                    }} 
                  />
                  <span>{t('sidebar.channels')}</span>
                </div>
                {currentUserRole !== 'guest' && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="input-icon-btn"
                      title={t('sidebar.browseChannels')}
                      onClick={() => onOpenBrowseChannels?.()}
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Globe size={14} />
                    </button>
                    <button
                      className="input-icon-btn"
                      title={t('sidebar.addChannel')}
                      onClick={() => onOpenCreateChannel?.()}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ borderBottom: '1px solid var(--border-light)', margin: '8px 0' }} />
            )}
            {(isChannelsExpanded || isCollapsed) && (
              <ul className="channel-list">
              {channels.filter(c => c.type !== 'dm' && !c.isStarred && !c.groupId).map((channel) => {
                const isActive = channel.id === activeChannelId;
                const hasUnread = channelUnreads[channel.id];
                
                const canEditChannel = (): boolean => {
                  if (isOwner) return true;
                  if (isGroupAdmin && channel.groupId) {
                    return currentUserLedGroups.includes(channel.groupId);
                  }
                  return false;
                };

                return (
                  <li
                    key={channel.id}
                    className={`channel-item ${(isActive && activeView === 'chat') ? 'active' : ''}`}
                    onClick={() => {
                      setActiveChannelId(channel.id);
                      setActiveView('chat');
                      closeMobileMenuIfNeeded();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isCollapsed ? 'center' : 'space-between',
                      paddingLeft: isCollapsed ? '0' : '12px',
                      paddingRight: isCollapsed ? '0' : '8px',
                      fontWeight: hasUnread ? '700' : '500',
                      color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                      position: 'relative'
                    }}
                    title={isCollapsed ? channel.name : undefined}
                  >
                    {isCollapsed ? (
                      <div 
                        className="channel-initial-avatar" 
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)',
                          color: isActive ? '#fff' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)'
                        }}
                      >
                        {channel.name.substring(0, 1).toUpperCase()}
                        {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                          <span className="channel-unread-badge collapsed">
                            {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
                          </span>
                        ) : (hasUnread && !isActive && (
                          <span style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--primary-color)',
                            border: '1px solid var(--bg-sidebar)'
                          }}></span>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {channel.isPrivate ? (
                            <Lock size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                          ) : (
                            <Hash size={16} style={{ flexShrink: 0 }} />
                          )}
                          <span>{channel.name}</span>
                        </div>
                        
                        {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                          <span className="channel-unread-badge">
                            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                          </span>
                        ) : (hasUnread && !isActive && (
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--primary-color)',
                            flexShrink: 0,
                            marginRight: '8px'
                          }}></span>
                        ))}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStarChannel?.(channel.id, !!channel.isStarred);
                          }}
                          className={`channel-star-btn ${channel.isStarred ? 'starred' : ''}`}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: channel.isStarred ? 'var(--accent-warning, #f59e0b)' : 'var(--text-muted)', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            padding: '4px',
                            marginLeft: '4px'
                          }}
                          title={channel.isStarred ? "お気に入りから外す" : "お気に入りに追加"}
                        >
                          <Star size={14} fill={channel.isStarred ? "var(--accent-warning, #f59e0b)" : "none"} />
                        </button>

                        {canEditChannel() && onOpenChannelSettings && (
                          <button
                            className="channel-menu-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenChannelSettings(channel);
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: isActive ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="チャンネル設定"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </div>

          {/* グループセクション一覧 */}
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.id] || false;
            const groupChannels = channels.filter(c => c.type !== 'dm' && !c.isStarred && c.groupId === group.id);
            
            const isGroupLeader = isGroupAdmin && currentUserLedGroups.includes(group.id);
            const canAddGroupChannel = isOwner || isGroupLeader;

            return (
              <div key={group.id} className="sidebar-section" style={{ padding: isCollapsed ? '0 4px' : '0 8px', marginBottom: '8px' }}>
                {!isCollapsed ? (
                  <div 
                    className="section-title"
                    onClick={() => toggleGroupExpand(group.id)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <ChevronRight 
                        size={14} 
                        style={{ 
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          color: 'var(--text-muted)',
                          flexShrink: 0
                        }} 
                      />
                      {group.isPrivate ? (
                        <Lock size={13} style={{ color: 'var(--accent-warning, #f59e0b)', flexShrink: 0 }} />
                      ) : (
                        <Users size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
                    </div>
                    {currentUserRole !== 'guest' && canAddGroupChannel && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button
                          className="input-icon-btn"
                          title={t('error') === 'Error' ? 'Add channel to this group' : 'このグループにチャンネルを追加'}
                          onClick={() => onOpenCreateChannel?.(group.id)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ borderBottom: '1px solid var(--border-light)', margin: '8px 0' }} />
                )}
                {(isExpanded || isCollapsed) && (
                  <ul className="channel-list">
                    {groupChannels.map((channel) => {
                      const isActive = channel.id === activeChannelId;
                      const hasUnread = channelUnreads[channel.id];

                      const canEditChannel = (): boolean => {
                        if (isOwner) return true;
                        if (isGroupAdmin && channel.groupId) {
                          return currentUserLedGroups.includes(channel.groupId);
                        }
                        return false;
                      };

                      return (
                        <li
                          key={channel.id}
                          className={`channel-item ${(isActive && activeView === 'chat') ? 'active' : ''}`}
                          onClick={() => {
                            setActiveChannelId(channel.id);
                            setActiveView('chat');
                            closeMobileMenuIfNeeded();
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isCollapsed ? 'center' : 'space-between',
                            paddingLeft: isCollapsed ? '0' : '16px',
                            paddingRight: isCollapsed ? '0' : '8px',
                            fontWeight: hasUnread ? '700' : '500',
                            color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                            position: 'relative'
                          }}
                          title={isCollapsed ? channel.name : undefined}
                        >
                          {isCollapsed ? (
                            <div 
                              className="channel-initial-avatar" 
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)',
                                color: isActive ? '#fff' : 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)'
                              }}
                            >
                              {channel.name.substring(0, 1).toUpperCase()}
                              {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                                <span className="channel-unread-badge collapsed">
                                  {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
                                </span>
                              ) : (hasUnread && !isActive && (
                                <span style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: 'var(--primary-color)',
                                  border: '1px solid var(--bg-sidebar)'
                                }}></span>
                              ))}
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {channel.isPrivate ? (
                                  <Lock size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                                ) : (
                                  <Hash size={16} style={{ flexShrink: 0 }} />
                                )}
                                <span>{channel.name}</span>
                              </div>
                              
                              {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                                <span className="channel-unread-badge">
                                  {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                                </span>
                              ) : (hasUnread && !isActive && (
                                <span style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: 'var(--primary-color)',
                                  flexShrink: 0,
                                  marginRight: '8px'
                                }}></span>
                              ))}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleStarChannel?.(channel.id, !!channel.isStarred);
                                }}
                                className={`channel-star-btn ${channel.isStarred ? 'starred' : ''}`}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  color: channel.isStarred ? 'var(--accent-warning, #f59e0b)' : 'var(--text-muted)', 
                                  cursor: 'pointer', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  padding: '4px',
                                  marginLeft: '4px'
                                }}
                                title={channel.isStarred ? "お気に入りから外す" : "お気に入りに追加"}
                              >
                                <Star size={14} fill={channel.isStarred ? "var(--accent-warning, #f59e0b)" : "none"} />
                              </button>

                              {canEditChannel() && onOpenChannelSettings && (
                                <button
                                  className="channel-menu-btn"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenChannelSettings(channel);
                                  }}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: isActive ? 1 : 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="チャンネル設定"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                    {!isCollapsed && groupChannels.length === 0 && (
                      <li style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--text-disabled)', listStyle: 'none' }}>
                        {t('error') === 'Error' ? 'No channels' : 'チャンネルがありません'}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}

          {/* ダイレクトメッセージセクション - ゲスト以外 */}
          {currentUserRole !== 'guest' && subscription?.dmEnabled !== false && (
            <div className="sidebar-section" style={{ padding: isCollapsed ? '0 4px' : '0 8px' }}>
              {!isCollapsed ? (
                <div 
                  className="section-title"
                  onClick={() => setIsDmsExpanded(!isDmsExpanded)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ChevronRight 
                      size={14} 
                      style={{ 
                        transform: isDmsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        color: 'var(--text-muted)',
                        flexShrink: 0
                      }} 
                    />
                    <span>{t('sidebar.dms')}</span>
                  </div>
                  {onOpenStartDm && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <button
                        className="input-icon-btn"
                        title={t('sidebar.startDm')}
                        onClick={onOpenStartDm}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ borderBottom: '1px solid var(--border-light)', margin: '8px 0' }} />
              )}
              {(isDmsExpanded || isCollapsed) && (
                <ul className="channel-list">
                {channels.filter(c => c.type === 'dm' && !c.isStarred).map((channel) => {
                  const isActive = channel.id === activeChannelId;
                  const hasUnread = channelUnreads[channel.id];

                  const getDmDisplayName = (dmName: string): string => {
                    if (!currentUser) return dmName;
                    const names = dmName.split(',').map((n) => n.trim());
                    const filtered = names.filter((n) => n !== currentUser.displayName);
                    if (filtered.length === 0) return dmName;
                    return filtered.join(', ');
                  };

                  const dmDisplayName = getDmDisplayName(channel.name);

                  return (
                    <li
                      key={channel.id}
                      className={`channel-item ${(isActive && activeView === 'chat') ? 'active' : ''}`}
                      onClick={() => {
                        setActiveChannelId(channel.id);
                        setActiveView('chat');
                        closeMobileMenuIfNeeded();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        paddingLeft: isCollapsed ? '0' : '12px',
                        paddingRight: isCollapsed ? '0' : '8px',
                        fontWeight: hasUnread ? '700' : '500',
                        color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)',
                        position: 'relative'
                      }}
                      title={isCollapsed ? dmDisplayName : undefined}
                    >
                      {isCollapsed ? (
                        <div 
                          className="channel-initial-avatar" 
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isActive ? 'var(--accent-primary)' : 'var(--bg-panel)',
                            color: isActive ? '#fff' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)'
                          }}
                        >
                          {dmDisplayName.substring(0, 1).toUpperCase()}
                          {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                            <span className="channel-unread-badge collapsed">
                              {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
                            </span>
                          ) : (hasUnread && !isActive && (
                            <span style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: 'var(--primary-color)',
                              border: '1px solid var(--bg-sidebar)'
                            }}></span>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            <MessageCircle size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                            <span>{dmDisplayName}</span>
                          </div>

                           {channel.unreadCount !== undefined && channel.unreadCount > 0 && !isActive ? (
                            <span className="channel-unread-badge">
                              {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                            </span>
                          ) : (hasUnread && !isActive && (
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: 'var(--primary-color)',
                              flexShrink: 0,
                              marginRight: '8px'
                            }}></span>
                          ))}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStarChannel?.(channel.id, !!channel.isStarred);
                            }}
                            className={`channel-star-btn ${channel.isStarred ? 'starred' : ''}`}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: channel.isStarred ? 'var(--accent-warning, #f59e0b)' : 'var(--text-muted)', 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              padding: '4px',
                              marginLeft: '4px'
                            }}
                            title={channel.isStarred ? "お気に入りから外す" : "お気に入りに追加"}
                          >
                            <Star size={14} fill={channel.isStarred ? "var(--accent-warning, #f59e0b)" : "none"} />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          )}
        </div>

        {/* ユーザー情報フッター */}
        {currentUser && (
          <div ref={userMenuRef} className="sidebar-footer" style={{ position: 'relative', zIndex: showUserMenu ? 2000 : 1, padding: isCollapsed ? '12px 0' : '12px 16px', borderTop: '1px solid var(--border-light)' }}>
            {isCollapsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
                <div 
                  className="user-avatar" 
                  style={{ overflow: 'hidden', width: '32px', height: '32px', cursor: 'pointer' }}
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setShowWorkspaceMenu(false);
                  }}
                >
                  {currentUser.avatarUrl ? (
                    <img 
                      src={getApiUrl(currentUser.avatarUrl)} 
                      alt="Avatar" 
                      style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                    />
                  ) : (
                    currentUser.displayName.substring(0, 1).toUpperCase()
                  )}
                </div>
                
                {/* テーマ切り替えトグル削除 */}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer', overflow: 'hidden' }}
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setShowWorkspaceMenu(false);
                  }}
                >
                  <div className="user-avatar" style={{ overflow: 'hidden', flexShrink: 0 }}>
                    {currentUser.avatarUrl ? (
                      <img 
                        src={getApiUrl(currentUser.avatarUrl)} 
                        alt="Avatar" 
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                      />
                    ) : (
                      currentUser.displayName.substring(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="user-info" style={{ flex: 1, overflow: 'hidden' }}>
                    <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.displayName}</div>
                    <div className="user-status" style={{ fontSize: '10px' }}>
                      {t('error') === 'Error' 
                        ? `Active (${currentUserRole === 'owner' ? 'Owner' : currentUserRole === 'member' ? 'Member' : 'Guest'})` 
                        : `アクティブ (${currentUserRole === 'owner' ? '管理者' : currentUserRole === 'member' ? 'メンバー' : 'ゲスト'})`}
                    </div>
                  </div>
                </div>
                
              </div>
            )}

            {/* アバタークリックポップアップメニュー */}
            {showUserMenu && (
              <div 
                className="user-popover-menu" 
                style={{ 
                  position: 'absolute', 
                  bottom: '100%', 
                  left: isCollapsed ? '40px' : '10px', 
                  zIndex: 2000, 
                  background: 'var(--bg-sidebar)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '8px', 
                  padding: '6px 0', 
                  boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.2)',
                  minWidth: '160px',
                  marginBottom: '8px'
                }}
              >
                {onOpenUserProfile && (
                  <button 
                    onClick={() => {
                      onOpenUserProfile();
                      setShowUserMenu(false);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', fontSize: '13px' }}
                  >
                    <User size={14} />
                    <span>{t('profile.title')}</span>
                  </button>
                )}
                {onLogout && (
                  <button 
                    onClick={() => {
                      onLogout();
                      setShowUserMenu(false);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--accent-danger)', textAlign: 'left', cursor: 'pointer', fontSize: '13px', borderTop: '1px solid var(--border-light)' }}
                  >
                    <LogOut size={14} />
                    <span>{t('sidebar.logout')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

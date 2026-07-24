import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { ChatArea } from '../components/ChatArea';
import { ItemsArea } from '../components/ItemsArea';
import { InboxArea } from '../components/InboxArea';
import type { Notification } from '../components/InboxArea';
import { UserProfileModal } from '../components/UserProfileModal';
import { ChannelSettingsModal } from '../components/ChannelSettingsModal';
import { WorkspaceMembersModal } from '../components/WorkspaceMembersModal';
import { StartDmModal } from '../components/StartDmModal';
import { CreateWorkspaceModal } from '../components/CreateWorkspaceModal';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { BrowseChannelsModal } from '../components/BrowseChannelsModal';
import { DocumentPanel } from '../components/DocumentPanel';
import { MediaLibraryArea } from '../components/MediaLibraryArea';
import { DashboardArea, DashboardTask, DashboardActivity } from '../components/DashboardArea';
import { useChat, Message, User } from '../hooks/useChat';
import { SearchView } from '../components/SearchView';
import { usePolling } from '../hooks/usePolling';
import { apiClient } from '../utils/apiClient';
import { SaasExtensions } from '../App';

import { useLanguage } from '../utils/i18n';

interface ChatPageProps {
  currentUser: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string | null;
    language?: string;
  };
  initialWorkspaceId: string;
  initialChannelId: string;
  onLogout: () => void;
  onUpdateUser: (displayName: string, avatarUrl: string | null, language: string, email?: string) => void;
  saas?: SaasExtensions;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  description?: string;
  type?: string;
  groupId?: string | null;
  updatedAt?: string | null;
  unreadCount?: number;
  isStarred?: boolean;
}

interface Workspace {
  id: string;
  name: string;
  custom_statuses?: string;
}

export const ChatPage: React.FC<ChatPageProps> = ({
  currentUser,
  initialWorkspaceId,
  initialChannelId,
  onLogout,
  onUpdateUser,
  saas,
}) => {
  const { t } = useLanguage();

  // localStorageから全チャンネルの最終閲覧日時をJSON文字列として取得するヘルパー
  const getLastReadsParam = useCallback(() => {
    const lastReads: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`last_view_chan_${currentUser.id}_`)) {
        const channelId = key.substring(`last_view_chan_${currentUser.id}_`.length);
        const value = localStorage.getItem(key);
        if (value) {
          lastReads[channelId] = value;
        }
      }
    }
    return JSON.stringify(lastReads);
  }, [currentUser.id]);
  // ログインユーザーのワークスペースにおけるロール
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'group_admin' | 'member' | 'guest'>('member');
  const [currentUserLedGroups, setCurrentUserLedGroups] = useState<string[]>([]);

  // ワークスペース・チャンネルのステート
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    { id: initialWorkspaceId, name: 'Default Workspace' }
  ]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem(`cohive_last_workspace_${currentUser.id}`) || initialWorkspaceId;
  });
  const [activeView, setActiveView] = useState<'dashboard' | 'chat' | 'items' | 'inbox' | 'workspace_doc' | 'media' | 'workspace_settings' | 'search' | 'workspace_members'>(() => {
    const saved = localStorage.getItem(`cohive_last_view_${currentUser.id}`);
    const validViews = ['dashboard', 'chat', 'items', 'inbox', 'workspace_doc', 'media', 'workspace_settings', 'search', 'workspace_members'];
    if (saved && validViews.includes(saved)) {
      return saved as any;
    }
    return 'dashboard';
  });

  // ダッシュボード用ステートと取得関数
  const [dashboardTasks, setDashboardTasks] = useState<any[]>([]);
  const [dashboardActivities, setDashboardActivities] = useState<any[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(false);

  const loadDashboardData = useCallback(async (silent = false) => {
    if (currentUserRole === 'guest') return;
    if (!silent) setLoadingDashboard(true);
    try {
      const [tasksRes, actRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: any[] }>('/api/items'),
        apiClient.get<{ success: boolean; data: any[] }>('/api/activities'),
      ]);
      if (tasksRes?.success && Array.isArray(tasksRes.data)) {
        setDashboardTasks(tasksRes.data);
      }
      if (actRes?.success && Array.isArray(actRes.data)) {
        setDashboardActivities(actRes.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (!silent) setLoadingDashboard(false);
    }
  }, [currentUserRole]);

  useEffect(() => {
    if (activeView === 'dashboard') {
      loadDashboardData(false);
    }
  }, [activeWorkspaceId, activeView, loadDashboardData]);
  // サブスクリプション制限情報ステート
  const [subscription, setSubscription] = useState<{
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
  } | null>(null);

  const [loadingWorkspace, setLoadingWorkspace] = useState<boolean>(true);

  const fetchSubscription = useCallback(async (wsId: string) => {
    try {
      const sub = await apiClient.getWorkspaceSubscription(wsId);
      setSubscription(sub);
    } catch (err) {
      console.error("Failed to fetch subscription status:", err);
    }
  }, []);

  const [workspaceSettingsInitialTab, setWorkspaceSettingsInitialTab] = useState<'members' | 'groups' | 'general' | 'statuses' | 'smtp' | 'subscription'>('members');

  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalType, setLimitModalType] = useState<'channel' | 'workspace' | 'member' | 'storage' | null>(null);
  const [limitModalValue, setLimitModalValue] = useState<number | string | undefined>(undefined);



  const [channels, setChannels] = useState<Channel[]>([
    { id: initialChannelId, name: 'general', isPrivate: false }
  ]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(() => {
    const wsId = localStorage.getItem(`cohive_last_workspace_${currentUser.id}`) || initialWorkspaceId;
    return localStorage.getItem(`cohive_last_channel_${currentUser.id}_${wsId}`) || initialChannelId;
  });

  // 通知（受信箱）用ステート
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);
  const [channelUnreads, setChannelUnreads] = useState<Record<string, boolean>>({});
  const [inboxFilter, setInboxFilter] = useState<'unread' | 'all' | 'archived'>('unread');
  
  // 通知からのタスクジャンプID
  const [jumpItemId, setJumpItemId] = useState<string | null>(null);

  // 返信対象のメッセージ
  const [replyTargetMessage, setReplyTargetMessage] = useState<Message | null>(null);

  // 個別モーダルの開閉状態
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWorkspaceSettingsModalOpen, setIsWorkspaceSettingsModalOpen] = useState(false);
  const [selectedChannelToEdit, setSelectedChannelToEdit] = useState<Channel | null>(null);
  const [isStartDmOpen, setIsStartDmOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [defaultGroupIdForNewChannel, setDefaultGroupIdForNewChannel] = useState<string | undefined>(undefined);
  const [isBrowseChannelsOpen, setIsBrowseChannelsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return window.innerWidth <= 768;
  });

  // 全文検索で指定メッセージへジャンプするためのステート
  const [targetScrollMessageId, setTargetScrollMessageId] = useState<string | null>(null);

  // カスタム絵文字リスト
  const [customEmojis, setCustomEmojis] = useState<any[]>([]);

  const fetchCustomEmojis = useCallback(async (wsId: string) => {
    try {
      const res = await apiClient.get<{ success: boolean; data: any[] }>(
        `/api/workspaces/${wsId}/emojis`
      );
      if (res.success && Array.isArray(res.data)) {
        setCustomEmojis(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch custom emojis:', err);
    }
  }, []);

  // 検索結果のメッセージをクリックした時のジャンプ処理
  const handleJumpToMessage = useCallback(async (channelId: string, messageId: string) => {
    if (activeChannelId !== channelId) {
      setActiveChannelId(channelId);
    }
    setActiveView('chat');
    setTargetScrollMessageId(messageId);
  }, [activeChannelId]);


  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  const fetchGroups = useCallback(async (wsId: string) => {
    try {
      const res = await apiClient.get<{ success: boolean; data: any[] }>(
        `/api/workspaces/${wsId}/groups`
      );
      if (res.success && Array.isArray(res.data)) {
        setGroups(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  }, []);

  // 1. ユーザープロフィールのマッピング (useChat hook 用)
  const chatUser: User = {
    id: currentUser.id,
    displayName: currentUser.displayName,
    avatarUrl: currentUser.avatarUrl || undefined,
  };

  // ワークスペースドキュメント用ステートと処理
  const [workspaceDocText, setWorkspaceDocText] = useState('');

  const fetchWorkspaceDoc = useCallback(async (workspaceId: string) => {
    if (currentUserRole === 'guest') return;
    try {
      const res = await apiClient.get<{ success: boolean; document: string }>(
        `/api/workspaces/${workspaceId}/document`
      );
      if (res.success) {
        setWorkspaceDocText(res.document || '');
      }
    } catch (err) {
      console.error('Failed to fetch workspace document:', err);
    }
  }, [currentUserRole]);

  const handleSaveWorkspaceDoc = async (text: string) => {
    if (!activeWorkspaceId) return;
    const res = await apiClient.put<{ success: boolean }>(
      `/api/workspaces/${activeWorkspaceId}/document`,
      { document: text }
    );
    if (res.success) {
      setWorkspaceDocText(text);
    } else {
      throw new Error(t('error') === 'Error' ? 'Failed to save' : '保存できませんでした');
    }
  };

  // 2. メッセージ送信 API (Workers 呼び出し)
  const apiSendMessage = useCallback(
    async (params: {
      channelId: string;
      content: string;
      parentId?: string | null;
      fileUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
    }) => {
      const response = await apiClient.post<{
        success: boolean;
        data: { id: string; createdAt: string };
      }>(`/api/messages`, {
        channelId: params.channelId,
        content: params.content,
        parentId: params.parentId || null,
        fileUrl: params.fileUrl || null,
        fileName: params.fileName || null,
        fileSize: params.fileSize || null,
      });

      if (response.success && response.data) {
        return {
          id: response.data.id,
          createdAt: response.data.createdAt,
        };
      }
      throw new Error('Failed to send message');
    },
    []
  );

  // 3. メッセージ配信用カスタムフック (メインチャット用)
  const {
    messages,
    sendMessage,
    retryMessage,
    deleteFailedMessage,
    setFetchedMessages,
    toggleLocalReaction,
    toggleLocalPin,
  } = useChat({
    channelId: activeChannelId || '',
    currentUser: chatUser,
    apiSendMessage,
  });

  const [hasMorePastMessages, setHasMorePastMessages] = useState(true);
  const [loadingPastMessages, setLoadingPastMessages] = useState(false);

  // 過去ログフェッチ関数
  const loadPastMessages = useCallback(async () => {
    if (!activeChannelId || loadingPastMessages || !hasMorePastMessages) return;
    if (messages.length === 0) return;

    setLoadingPastMessages(true);
    try {
      const before = messages[0].createdAt;
      const response = await apiClient.get<{
        success: boolean;
        data: Message[];
      }>(`/api/messages`, {
        channel_id: activeChannelId,
        before,
        limit: "50",
      });

      if (response.success && Array.isArray(response.data)) {
        const newMsgs = response.data;
        if (newMsgs.length > 0) {
          setFetchedMessages(newMsgs);
        }
        if (newMsgs.length < 50) {
          setHasMorePastMessages(false);
        }
      }
    } catch (error) {
      console.error("Failed to load past messages:", error);
    } finally {
      setLoadingPastMessages(false);
    }
  }, [activeChannelId, messages, hasMorePastMessages, loadingPastMessages, setFetchedMessages]);

  // 4. メッセージフェッチロジック (ポーリングから呼び出す)
  const lastFetchedIdRef = useRef<string | null>(null);

  const fetchNewMessages = useCallback(async (): Promise<number> => {
    if (!activeChannelId) return 0;

    try {
      const params: Record<string, string> = {
        channel_id: activeChannelId,
      };
      if (lastFetchedIdRef.current) {
        params.since = lastFetchedIdRef.current;
      } else {
        params.limit = "50";
      }

      const response = await apiClient.get<{
        success: boolean;
        data: Message[];
      }>(`/api/messages`, params);

      if (response.success && Array.isArray(response.data)) {
        const newMsgs = response.data;
        if (newMsgs.length > 0) {
          setFetchedMessages(newMsgs);
          lastFetchedIdRef.current = newMsgs[newMsgs.length - 1].id;
        }
        return newMsgs.length;
      }
    } catch (error) {
      console.error('Failed to fetch new messages:', error);
    }
    return 0;
  }, [activeChannelId, setFetchedMessages]);

  // 5. 動的ポーリングフックの有効化
  const pollingInfo = usePolling({
    channelId: activeChannelId,
    onFetch: fetchNewMessages,
    minInterval: 5000,
    maxInterval: 30000,
  });

  // チャンネル切り替え時にフェッチの基準となるメッセージIDをリセット
  useEffect(() => {
    lastFetchedIdRef.current = null;
    setReplyTargetMessage(null);
    setHasMorePastMessages(true);
  }, [activeChannelId]);

  // 最後に見ていたワークスペース、ビュー、チャンネルを自動保存
  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem(`cohive_last_workspace_${currentUser.id}`, activeWorkspaceId);
    }
  }, [activeWorkspaceId, currentUser.id]);

  useEffect(() => {
    if (activeView) {
      localStorage.setItem(`cohive_last_view_${currentUser.id}`, activeView);
    }
  }, [activeView, currentUser.id]);

  useEffect(() => {
    if (activeWorkspaceId && activeChannelId) {
      localStorage.setItem(`cohive_last_channel_${currentUser.id}_${activeWorkspaceId}`, activeChannelId);
    }
  }, [activeChannelId, activeWorkspaceId, currentUser.id]);

  // ユーザーのワークスペースにおけるロールを取得
  const fetchUserRole = useCallback(async (workspaceId: string) => {
    try {
      const res = await apiClient.get<{ success: boolean; role: 'owner' | 'group_admin' | 'member' | 'guest'; ledGroups?: string[] }>(
        `/api/workspaces/${workspaceId}/role`
      );
      if (res.success && res.role) {
        setCurrentUserRole(res.role);
        setCurrentUserLedGroups(res.ledGroups || []);

        // ゲストの場合の強制ビュー切り替え
        if (res.role === 'guest') {
          const guestDeniedViews = ['workspace_doc', 'workspace_settings', 'items', 'media', 'inbox', 'workspace_members'];
          setActiveView(prev => guestDeniedViews.includes(prev) ? 'chat' : prev);
        }
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
    }
  }, []);

  // 6. ワークスペースおよびチャンネル一覧のロード (マウント時)
  useEffect(() => {
    const loadSidebarData = async () => {
      try {
        const wsResponse = await apiClient.get<{ success: boolean; data: Workspace[] }>('/api/workspaces');
        if (wsResponse.success && Array.isArray(wsResponse.data)) {
          const validWorkspaces = wsResponse.data.filter((w: any) => w.status !== 'suspended');
          setWorkspaces(validWorkspaces);
          if (validWorkspaces.length > 0) {
            const exists = validWorkspaces.some((w: any) => w.id === activeWorkspaceId);
            const targetWsId = exists && activeWorkspaceId ? activeWorkspaceId : validWorkspaces[0].id;
            setActiveWorkspaceId(targetWsId);
            fetchUserRole(targetWsId);
          } else {
            setActiveWorkspaceId(null);
            setLoadingWorkspace(false);
          }
        } else {
          setLoadingWorkspace(false);
        }
      } catch (err) {
        console.warn('Workspace API fallback to default:', err);
        setLoadingWorkspace(false);
      }
    };
    loadSidebarData();
  }, []);

  // 選択されたワークスペース配下のチャンネル一覧とメンバー一覧のロード
  useEffect(() => {
    if (!activeWorkspaceId) return;

    fetchCustomEmojis(activeWorkspaceId);

    const loadChannelsAndMembers = async () => {
      setLoadingWorkspace(true);
      try {
        const [subRes, chanResponse, memResponse, groupsResponse] = await Promise.all([
          apiClient.getWorkspaceSubscription(activeWorkspaceId).catch(err => {
            console.error("Failed to fetch subscription status:", err);
            return null;
          }),
          apiClient.get<{ success: boolean; data: Channel[] }>(
            `/api/workspaces/${activeWorkspaceId}/channels`,
            { last_reads: getLastReadsParam() }
          ).catch(err => {
            console.warn('Channels API fallback to default:', err);
            return null;
          }),
          apiClient.get<{ success: boolean; data: any[] }>(
            `/api/workspaces/${activeWorkspaceId}/members`
          ).catch(err => {
            console.warn('Workspace members load error:', err);
            return null;
          }),
          apiClient.get<{ success: boolean; data: any[] }>(
            `/api/workspaces/${activeWorkspaceId}/groups`
          ).catch(err => {
            console.warn('Workspace groups load error:', err);
            return null;
          })
        ]);

        if (subRes) {
          setSubscription(subRes);
        }

        if (chanResponse && chanResponse.success && Array.isArray(chanResponse.data)) {
          setChannels(chanResponse.data);
          
          // そのワークスペースで最後に見ていたチャンネルIDを取得
          const savedChanId = localStorage.getItem(`cohive_last_channel_${currentUser.id}_${activeWorkspaceId}`);
          const hasSavedChan = chanResponse.data.some(c => c.id === savedChanId);
          
          if (hasSavedChan && savedChanId) {
            setActiveChannelId(savedChanId);
          } else if (chanResponse.data.length > 0) {
            setActiveChannelId(chanResponse.data[0].id);
          } else {
            setActiveChannelId(null);
          }
        }

        if (memResponse && memResponse.success && Array.isArray(memResponse.data)) {
          setWorkspaceMembers(memResponse.data);
        }

        if (groupsResponse && groupsResponse.success && Array.isArray(groupsResponse.data)) {
          setGroups(groupsResponse.data);
        }
      } catch (err) {
        console.error('Failed to load workspace data:', err);
      } finally {
        setLoadingWorkspace(false);
      }
    };
    fetchUserRole(activeWorkspaceId);
    loadChannelsAndMembers();
    fetchWorkspaceDoc(activeWorkspaceId);
  }, [activeWorkspaceId, fetchUserRole, fetchWorkspaceDoc]);

  // チャンネルメンバー取得関数
  const fetchChannelMembers = useCallback(async (channelId: string) => {
    try {
      const response = await apiClient.get<{ success: boolean; data: any[] }>(
        `/api/channels/${channelId}/members`
      );
      if (response.success && Array.isArray(response.data)) {
        setChannelMembers(response.data);
      }
    } catch (error) {
      console.error('Failed to load channel members:', error);
    }
  }, []);

  // 選択されたチャンネルのメンバー一覧をロード
  useEffect(() => {
    if (!activeChannelId) {
      setChannelMembers([]);
      return;
    }
    fetchChannelMembers(activeChannelId);
  }, [activeChannelId, fetchChannelMembers]);

  // ------------------------------------------------------------
  // 通知（受信箱）およびサイドバー未読制御ロジック
  // ------------------------------------------------------------

  // 通知一覧取得関数（グローバル：全ワークスペース横断）
  const loadNotifications = useCallback(async (filterVal = inboxFilter) => {
    if (currentUserRole === 'guest') return;
    try {
      const res = await apiClient.get<{ success: boolean; data: Notification[]; unreadCount?: number }>(
        `/api/notifications?filter=${filterVal}`
      );
      if (res.success && Array.isArray(res.data)) {
        setNotifications(res.data);
        if (res.unreadCount !== undefined) {
          setUnreadNotificationsCount(res.unreadCount);
        } else {
          const unreadCount = res.data.filter((n) => n.isRead === 0).length;
          setUnreadNotificationsCount(unreadCount);
        }
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [inboxFilter, currentUserRole]);

  // 通知既読化API
  const handleReadNotification = async (id: string) => {
    try {
      const res = await apiClient.put<{ success: boolean }>(`/api/notifications/${id}/read`);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: 1 } : n))
        );
        setUnreadNotificationsCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // 通知一括既読化API
  const handleReadAllNotifications = async () => {
    if (!activeWorkspaceId) return;
    try {
      const res = await apiClient.put<{ success: boolean }>(
        `/api/workspaces/${activeWorkspaceId}/notifications/read-all`
      );
      if (res.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
        setUnreadNotificationsCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  // 通知アーカイブ化API
  const handleArchiveNotification = async (id: string, archive: boolean) => {
    try {
      const res = await apiClient.put<{ success: boolean }>(
        `/api/notifications/${id}/archive`,
        { archive }
      );
      if (res.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        
        const target = notifications.find((n) => n.id === id);
        if (target && target.isRead === 0) {
          if (archive) {
            setUnreadNotificationsCount((prev) => Math.max(0, prev - 1));
          }
        }
        
        await loadNotifications(inboxFilter);
      }
    } catch (err) {
      console.error('Failed to update notification archive status:', err);
    }
  };

  // チャット画面を開いた際に localStorage の最終閲覧時刻を更新する
  useEffect(() => {
    if (activeView === 'chat' && activeChannelId && currentUser) {
      localStorage.setItem(
        `last_view_chan_${currentUser.id}_${activeChannelId}`,
        new Date().toISOString()
      );
      setChannelUnreads((prev) => ({ ...prev, [activeChannelId]: false }));
    }
  }, [activeChannelId, activeView, currentUser]);

  // チャンネルリスト変更時・閲覧切り替え時に未読（太字）を判定する
  useEffect(() => {
    if (!currentUser || channels.length === 0) return;
    const unreads: Record<string, boolean> = {};
    channels.forEach((c) => {
      if (c.id === activeChannelId && activeView === 'chat') {
        unreads[c.id] = false;
        return;
      }
      const lastRead = localStorage.getItem(`last_view_chan_${currentUser.id}_${c.id}`);
      if (!lastRead) {
        unreads[c.id] = false; // 初期状態では未読にしない（ノイズ防止）
      } else if (c.updatedAt) {
        unreads[c.id] = new Date(c.updatedAt) > new Date(lastRead);
      } else {
        unreads[c.id] = false;
      }
    });
    setChannelUnreads(unreads);
  }, [channels, activeChannelId, activeView, currentUser]);

  // ユーザーのアイドル状態（離席）とアクティブ状態を管理
  const [isPageActive, setIsPageActive] = useState(document.visibilityState === 'visible');
  const [isPageIdle, setIsPageIdle] = useState(false);
  const pageIdleTimeoutRef = useRef<any>(null);

  // 通知許可 & プッシュ登録状況
  const [isPushActive, setIsPushActive] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsPushActive(!!sub);
        }).catch(() => setIsPushActive(false));
      }).catch(() => setIsPushActive(false));
    }
  }, []);

  // アイドルから復帰時やタブアクティブ時の同期処理
  const syncPageData = useCallback(async () => {
    if (currentUserRole === 'guest') return;
    try {
      const count = await apiClient.getUnreadNotificationsCount();
      setUnreadNotificationsCount(count);

      if (activeView === 'inbox') {
        loadNotifications();
      }

      if (activeWorkspaceId) {
        const [chanRes, groupsRes] = await Promise.all([
          apiClient.get<{ success: boolean; data: Channel[] }>(
            `/api/workspaces/${activeWorkspaceId}/channels`,
            { last_reads: getLastReadsParam() }
          ).catch(() => null),
          apiClient.get<{ success: boolean; data: any[] }>(
            `/api/workspaces/${activeWorkspaceId}/groups`
          ).catch(() => null)
        ]);

        if (chanRes && chanRes.success && Array.isArray(chanRes.data)) {
          setChannels(chanRes.data);
        }
        if (groupsRes && groupsRes.success && Array.isArray(groupsRes.data)) {
          setGroups(groupsRes.data);
        }
      }
    } catch (err) {
      console.error('Failed to sync page data:', err);
    }
  }, [activeWorkspaceId, activeView, currentUserRole, loadNotifications, getLastReadsParam]);

  // アイドル判定
  useEffect(() => {
    const resetIdle = () => {
      if (isPageIdle) {
        setIsPageIdle(false);
        if (document.visibilityState === 'visible') {
          syncPageData();
        }
      }
      if (pageIdleTimeoutRef.current) clearTimeout(pageIdleTimeoutRef.current);
      pageIdleTimeoutRef.current = setTimeout(() => {
        setIsPageIdle(true);
      }, 180000); // 3分
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetIdle));
    resetIdle();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (pageIdleTimeoutRef.current) clearTimeout(pageIdleTimeoutRef.current);
    };
  }, [isPageIdle, syncPageData]);

  // アクティブ（visibilitychange）監視
  useEffect(() => {
    const handleVis = () => {
      const visible = document.visibilityState === 'visible';
      setIsPageActive(visible);
      if (visible && !isPageIdle) {
        syncPageData();
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [isPageIdle, syncPageData]);

  // Service Worker からのプッシュ通知シグナル連携
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handlePushMsg = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        syncPageData();
      }
    };

    navigator.serviceWorker.addEventListener('message', handlePushMsg);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handlePushMsg);
    };
  }, [syncPageData]);

  // 定期ポーリングとバックアップ制御
  useEffect(() => {
    syncPageData();

    if (activeWorkspaceId) {
      fetchGroups(activeWorkspaceId);
    }

    const pollWorkspaces = async () => {
      if (!isPageActive || isPageIdle) return;
      try {
        const wsResponse = await apiClient.get<{ success: boolean; data: Workspace[] }>('/api/workspaces');
        if (wsResponse.success && Array.isArray(wsResponse.data)) {
          setWorkspaces(wsResponse.data);
        }
      } catch (err) {
        console.warn('Failed to poll workspaces:', err);
      }
    };
    
    const wsInterval = setInterval(pollWorkspaces, 30000); // ワークスペース一覧は30秒間隔

    if (isPushActive) {
      return () => {
        clearInterval(wsInterval);
      };
    }

    // プッシュ通知が無効な場合のみ、10秒おきに軽量な未読通知カウントのみをポーリング
    const countInterval = setInterval(() => {
      if (!isPageActive || isPageIdle) return;
      apiClient.getUnreadNotificationsCount()
        .then(count => setUnreadNotificationsCount(count))
        .catch(err => console.error('Failed to check unread count:', err));
    }, 10000);

    return () => {
      clearInterval(wsInterval);
      clearInterval(countInterval);
    };
  }, [activeWorkspaceId, isPageActive, isPageIdle, isPushActive, syncPageData, fetchGroups]);

  // タブのタイトルを動的に更新（未読通知がある場合は件数を表示）
  useEffect(() => {
    const defaultTitle = 'CoHive';
    if (unreadNotificationsCount > 0) {
      document.title = `(${unreadNotificationsCount}) ${defaultTitle}`;
    } else {
      document.title = defaultTitle;
    }
  }, [unreadNotificationsCount]);

  // スマートジャンプ（リンク遷移処理 - ワークスペース切り替え対応）
  const handleJumpToLink = (linkUrl: string, targetWorkspaceId?: string) => {
    if (targetWorkspaceId && targetWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(targetWorkspaceId);
    }

    // 1. チャットへの遷移: /channels/:channelId?msg=:msgId
    const chanMatch = linkUrl.match(/\/channels\/([^\/\?]+)/);
    if (chanMatch) {
      const channelId = chanMatch[1];
      setActiveView('chat');
      setActiveChannelId(channelId);

      const msgMatch = linkUrl.match(/msg=([^\&\s]+)/);
      if (msgMatch) {
        const msgId = msgMatch[1];
        setTimeout(() => {
          const element = document.getElementById(`message-${msgId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('reply-highlight');
            setTimeout(() => element.classList.remove('reply-highlight'), 2000);
          }
        }, 600);
      }
      return;
    }

    // 2. タスクへの遷移: /items?item=:itemId
    const itemMatch = linkUrl.match(/\/items\?item=([^\&\s]+)/);
    if (itemMatch) {
      const itemId = itemMatch[1];
      setActiveView('items');
      setJumpItemId(itemId); // ItemsAreaでモーダルを開かせる
      return;
    }
  };

  // アプリ起動時のURL確認（通知クリック等で直接 /channels/xxx などのパスが開かれた場合の初期表示）
  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const fullPath = path + search;
    
    if (fullPath && fullPath !== '/') {
      // データのロード完了を考慮し、少し遅延させてジャンプ処理を呼び出す
      setTimeout(() => {
        handleJumpToLink(fullPath);
      }, 800);
    }
  }, []);



  // ------------------------------------------------------------

  const handleCreateWorkspace = useCallback(async (name: string) => {
    const response = await apiClient.post<{
      success: boolean;
      data: Workspace;
    }>('/api/workspaces', { name });
    if (response.success && response.data) {
      setWorkspaces(prev => [...prev, response.data]);
      setActiveWorkspaceId(response.data.id);
    } else {
      throw new Error('Failed to create workspace');
    }
  }, []);

  const handleCreateChannel = useCallback(async (name: string, description: string, isPrivate: boolean, groupId?: string) => {
    if (!activeWorkspaceId) return;
    const response = await apiClient.post<{
      success: boolean;
      data: Channel;
    }>(`/api/workspaces/${activeWorkspaceId}/channels`, { name, description, isPrivate, groupId: groupId || null });
    if (response.success && response.data) {
      setChannels(prev => [...prev, response.data]);
      setActiveChannelId(response.data.id);
      fetchSubscription(activeWorkspaceId);
    } else {
      throw new Error('Failed to create channel');
    }
  }, [activeWorkspaceId, fetchSubscription]);

  // 絵文字リアクションのトグル処理
  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    toggleLocalReaction(messageId, emoji, chatUser);

    try {
      await apiClient.post<{ success: boolean }>(`/api/messages/${messageId}/reactions`, { emoji });
    } catch (err: any) {
      console.error('Failed to toggle reaction:', err);
      toggleLocalReaction(messageId, emoji, chatUser);
    }
  }, [toggleLocalReaction, chatUser]);

  // 設定更新関連ハンドラー
  const handleUpdateProfile = async (displayName: string, avatarUrl: string | null, language: string) => {
    const res = await apiClient.put<{ success: boolean }>('/api/users/me', { displayName, avatarUrl, language });
    if (res.success) {
      onUpdateUser(displayName, avatarUrl, language);
    }
  };

  const handleUpdateWorkspace = async (name: string, customStatuses?: string) => {
    if (!activeWorkspaceId) return;
    const res = await apiClient.put<{ success: boolean; data: any }>(`/api/workspaces/${activeWorkspaceId}`, { name, customStatuses });
    if (res.success && res.data) {
      setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? {
        ...w,
        name: res.data.name || w.name,
        custom_statuses: res.data.customStatuses !== undefined ? res.data.customStatuses : (res.data.custom_statuses || w.custom_statuses)
      } : w));
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspaceId) return;
    const res = await apiClient.delete<{ success: boolean }>(`/api/workspaces/${activeWorkspaceId}`);
    if (res.success) {
      const remaining = workspaces.filter(w => w.id !== activeWorkspaceId);
      if (remaining.length > 0) {
        setWorkspaces(remaining);
        setActiveWorkspaceId(remaining[0].id);
      } else {
        onLogout();
      }
    }
  };

  const handleUpdateChannel = async (name: string, description: string, isPrivate: boolean) => {
    if (!selectedChannelToEdit) return;
    const res = await apiClient.put<{ success: boolean; data: Channel }>(
      `/api/channels/${selectedChannelToEdit.id}`,
      { name, description, isPrivate }
    );
    if (res.success && res.data) {
      setChannels(prev => prev.map(c => 
        c.id === selectedChannelToEdit.id 
          ? { ...c, name: res.data.name, description: res.data.description, isPrivate: res.data.isPrivate } 
          : c
      ));
    }
  };

  const handleCreateDm = async (memberIds: string[], name: string) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await apiClient.post<{ success: boolean; data: Channel }>(
        `/api/workspaces/${activeWorkspaceId}/channels`,
        {
          name,
          description: t('error') === 'Error' ? 'Direct Message' : 'ダイレクトメッセージ',
          isPrivate: true,
          type: "dm",
          memberIds
        }
      );
      if (res.success && res.data) {
        setChannels(prev => {
          if (prev.some(c => c.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        setActiveChannelId(res.data.id);
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to start DM: ' : 'DMの開始に失敗しました: ') + (err.message || err));
    }
  };

  const handleToggleStarChannel = async (channelId: string, currentStarred: boolean) => {
    try {
      const action = currentStarred ? 'unstar' : 'star';
      const res = await apiClient.post<{ success: boolean }>(`/api/channels/${channelId}/${action}`);
      if (res.success) {
        setChannels(prev => prev.map(c => 
          c.id === channelId ? { ...c, isStarred: !currentStarred } : c
        ));
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to toggle star: ' : 'お気に入りのトグルに失敗しました: ') + (err.message || err));
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannelToEdit) return;
    const res = await apiClient.delete<{ success: boolean }>(`/api/channels/${selectedChannelToEdit.id}`);
    if (res.success) {
      const remaining = channels.filter(c => c.id !== selectedChannelToEdit.id);
      setChannels(remaining);
      if (remaining.length > 0) {
        setActiveChannelId(remaining[0].id);
      } else {
        setActiveChannelId(null);
      }
    }
  };

  const handleLeaveChannel = async () => {
    if (!selectedChannelToEdit || !activeWorkspaceId) return;
    try {
      const res = await apiClient.delete<{ success: boolean }>(
        `/api/channels/${selectedChannelToEdit.id}/members/${currentUser.id}`
      );
      if (res.success) {
        const remaining = channels.filter(c => c.id !== selectedChannelToEdit.id);
        setChannels(remaining);
        if (remaining.length > 0) {
          setActiveChannelId(remaining[0].id);
        } else {
          setActiveChannelId(null);
        }
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to leave channel: ' : 'チャンネルからの退出に失敗しました: ') + (err.message || err));
    }
  };

  const handleJoinChannel = async (channelId: string) => {
    if (!activeWorkspaceId) return;
    try {
      const res = await apiClient.post<{ success: boolean; data: any }>(
        `/api/channels/${channelId}/members`,
        { userId: currentUser.id }
      );
        if (res.success) {
          const chanResponse = await apiClient.get<{ success: boolean; data: Channel[] }>(
            `/api/workspaces/${activeWorkspaceId}/channels`
          );
          if (chanResponse.success && Array.isArray(chanResponse.data)) {
            setChannels(chanResponse.data);
            setActiveChannelId(channelId);
            fetchChannelMembers(channelId);
            fetchSubscription(activeWorkspaceId);
          }
        }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to join channel: ' : 'チャンネルへの参加に失敗しました: ') + (err.message || err));
    }
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  if (loadingWorkspace) {
    return (
      <div className="setup-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main, #0f172a)' }}>
        <Loader className="animate-spin" size={32} style={{ color: 'var(--accent-primary, #0ea5e9)' }} />
      </div>
    );
  }

  if (subscription?.status === 'suspended') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#0f172a',
        color: '#fff',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '16px',
          padding: '40px 32px',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '16px', borderRadius: '50%', display: 'inline-flex' }}>
              <AlertCircle size={36} />
            </div>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px 0', color: '#fff' }}>
            ワークスペース一時停止中
          </h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#9ca3af', margin: '0 0 24px 0' }}>
            このワークスペース（{activeWorkspace?.name || '選択中'}）は管理者によって一時停止されています。チャット機能やファイルの参照・送信は制限されています。
          </p>
          {workspaces.filter(w => w.id !== activeWorkspaceId).length > 0 && (
            <button
              onClick={() => {
                const other = workspaces.find(w => w.id !== activeWorkspaceId);
                if (other) setActiveWorkspaceId(other.id);
              }}
              style={{
                padding: '10px 20px',
                background: '#0ea5e9',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              他のワークスペースに切り替える
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-container">
        {/* 左サイドバー */}
        <Sidebar
          onToggleStarChannel={handleToggleStarChannel}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          setActiveWorkspaceId={(id) => {
            setActiveWorkspaceId(id);
          }}
          channels={channels}
          activeChannelId={activeChannelId}
          groups={groups}
          setActiveChannelId={(id) => {
            setActiveChannelId(id);
          }}
          activeView={activeView}
          setActiveView={setActiveView}
          unreadNotificationsCount={unreadNotificationsCount}
          channelUnreads={channelUnreads}
          currentUser={currentUser}
          currentUserRole={currentUserRole}
          currentUserLedGroups={currentUserLedGroups}
          onLogout={onLogout}
          onOpenUserProfile={() => setIsProfileOpen(true)}
          onOpenWorkspaceMembers={(initialTab = 'members') => {
            setWorkspaceSettingsInitialTab(initialTab);
            if (initialTab === 'members' || initialTab === 'groups') {
              setActiveView('workspace_members');
              setActiveChannelId(null);
            } else {
              setIsWorkspaceSettingsModalOpen(true);
            }
          }}
          onOpenChannelSettings={(channel) => setSelectedChannelToEdit(channel)}
          onOpenCreateWorkspace={() => {
            if (saas?.checkWorkspaceLimit) {
              const limit = saas.checkWorkspaceLimit(workspaces.length);
              if (limit?.limitReached) {
                setLimitModalType('workspace');
                setLimitModalValue(3);
                setLimitModalOpen(true);
                return;
              }
            }
            setIsCreateWorkspaceOpen(true);
          }}
          onOpenCreateChannel={(defaultGroupId) => {
            if (subscription && subscription.plan === 'free' && subscription.channelUsed >= subscription.channelLimit) {
              setLimitModalType('channel');
              setLimitModalValue(subscription.channelLimit);
              setLimitModalOpen(true);
            } else {
              setDefaultGroupIdForNewChannel(defaultGroupId);
              setIsCreateChannelOpen(true);
            }
          }}
          onOpenBrowseChannels={() => setIsBrowseChannelsOpen(true)}
          onOpenStartDm={() => setIsStartDmOpen(true)}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          subscription={subscription}
        />

        {/* モバイルでメニュー展開時のオーバーレイ背景（タップで縮小表示に戻る） */}
        {!isCollapsed && (
          <div 
            className="mobile-sidebar-overlay"
            onClick={() => setIsCollapsed(true)}
          />
        )}

        {/* 中央エリアの条件付きレンダリング */}
        {activeView === 'dashboard' ? (
          <DashboardArea
            currentUserId={currentUser.id}
            workspaces={workspaces}
            tasks={dashboardTasks}
            activities={dashboardActivities}
            loading={loadingDashboard}
            onSelectWorkspace={(wsId) => {
              setActiveWorkspaceId(wsId);
              setActiveView('chat');
            }}
            onJumpToLink={handleJumpToLink}
            onMenuClick={() => setIsCollapsed(false)}
          />
        ) : activeView === 'workspace_doc' ? (
          <div style={{ flex: 1, height: '100%', display: 'flex', minWidth: 0 }}>
            <DocumentPanel
              title={t('error') === 'Error' ? `${activeWorkspace?.name || 'Workspace'}'s Document` : `${activeWorkspace?.name || 'ワークスペース'} のドキュメント`}
              initialValue={workspaceDocText}
              onSave={handleSaveWorkspaceDoc}
              type="workspace"
              lockKey={`workspace:${activeWorkspaceId}`}
            />
          </div>
        ) : activeView === 'workspace_members' ? (
          <div style={{ flex: 1, height: '100%', display: 'flex', minWidth: 0 }}>
            <WorkspaceMembersModal
              workspace={activeWorkspace}
              currentUserRole={currentUserRole}
              currentUserLedGroups={currentUserLedGroups}
              onUpdateWorkspace={handleUpdateWorkspace}
              onDeleteWorkspace={handleDeleteWorkspace}
              isEmbed={true}
              subscription={subscription}
              fetchSubscription={fetchSubscription}
              isMembersOnly={true}
              onCreateDm={handleCreateDm}
              isSaasMode={saas?.isSaasMode}
            />
          </div>
        ) : activeView === 'items' ? (
          <ItemsArea
            workspaceId={activeWorkspaceId}
            workspace={activeWorkspace}
            activeChannelId={activeChannelId}
            channels={channels}
            workspaceMembers={workspaceMembers}
            currentUserId={currentUser.id}
            highlightItemId={jumpItemId}
            onClearHighlightItem={() => setJumpItemId(null)}
            onUpdateWorkspace={handleUpdateWorkspace}
          />
        ) : (activeView === 'media' && subscription?.mediaEnabled !== false) ? (
          <MediaLibraryArea
            workspaceId={activeWorkspaceId}
            currentUserId={currentUser.id}
            currentUserRole={currentUserRole}
            channels={channels}
          />
        ) : activeView === 'inbox' ? (
          <InboxArea
            workspaceId={activeWorkspaceId}
            notifications={notifications}
            loading={loadingNotifications}
            filter={inboxFilter}
            onFilterChange={(newFilter) => {
              setInboxFilter(newFilter);
              loadNotifications(newFilter);
            }}
            onReadNotification={handleReadNotification}
            onReadAllNotifications={handleReadAllNotifications}
            onArchiveNotification={handleArchiveNotification}
            onJumpToLink={handleJumpToLink}
          />
        ) : activeView === 'search' ? (
          <SearchView
            workspaceId={activeWorkspaceId}
            workspaces={workspaces}
            customEmojis={customEmojis}
            onJumpToMessage={handleJumpToMessage}
            onMenuClick={() => setIsCollapsed(false)}
          />
        ) : activeChannelId && activeChannel ? (
          <ChatArea
            channelName={activeChannel.type === 'dm' ? 
              (() => {
                const names = activeChannel.name.split(',').map(n => n.trim());
                const filtered = names.filter(n => n !== currentUser.displayName);
                return filtered.length > 0 ? filtered.join(', ') : activeChannel.name;
              })() : activeChannel.name
            }
            channelDescription={activeChannel.description || (activeChannel.isPrivate ? (t('error') === 'Error' ? 'Private channel' : 'プライベートチャンネル') : (t('error') === 'Error' ? 'Public channel anyone can join' : '誰でも参加できるパブリックチャンネル'))}
            messages={messages}
            currentUserId={currentUser.id}
            channelMembers={channelMembers}
            workspaceMembers={workspaceMembers}
            workspaceId={activeWorkspaceId}
            activeChannelId={activeChannelId}
            channels={channels}
            subscription={subscription}
            onSendMessage={async (content, fileUrl, fileName, fileSize) => {
              await sendMessage(content, replyTargetMessage?.id, fileUrl, fileName, fileSize);
              setReplyTargetMessage(null);
            }}
            onRetryMessage={retryMessage}
            onDeleteFailedMessage={deleteFailedMessage}
            onSetReplyTarget={setReplyTargetMessage}
            replyTargetMessage={replyTargetMessage}
            onCancelReply={() => setReplyTargetMessage(null)}
            onToggleReaction={handleToggleReaction}
            onToggleLocalPin={toggleLocalPin}
            pollingInfo={pollingInfo}
            currentUserRole={currentUserRole}
            currentUserLedGroups={currentUserLedGroups}
            workspace={activeWorkspace}
            customEmojis={customEmojis}
            fetchCustomEmojis={() => fetchCustomEmojis(activeWorkspaceId!)}
            targetScrollMessageId={targetScrollMessageId}
            clearTargetScrollMessageId={() => setTargetScrollMessageId(null)}
            onJumpToMessage={handleJumpToMessage}
            onSearchClick={() => {
              setActiveView('search');
              setActiveChannelId(null);
            }}
            onCreateDm={handleCreateDm}
            onRefreshChannelMembers={fetchChannelMembers}
            onLoadPastMessages={loadPastMessages}
            hasMorePastMessages={hasMorePastMessages}
            loadingPastMessages={loadingPastMessages}
          />
        ) : (
          <div className="no-message-selected" style={{ flex: 1 }}>
            <p>{t('error') === 'Error' ? 'Please select a channel or DM.' : 'チャンネルまたはDMを選択してください。'}</p>
          </div>
        )}
      </div>

      {/* プロフィール設定モーダル */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onUpdateProfile={handleUpdateProfile}
        onUpdateEmail={(newEmail) => onUpdateUser(currentUser.displayName, currentUser.avatarUrl || null, currentUser.language || 'ja', newEmail)}
      />

      {/* ワークスペース設定モーダル（ポップアップ形式） */}
      <WorkspaceMembersModal
        isOpen={isWorkspaceSettingsModalOpen}
        onClose={() => setIsWorkspaceSettingsModalOpen(false)}
        workspace={activeWorkspace}
        currentUserRole={currentUserRole}
        currentUserLedGroups={currentUserLedGroups}
        onUpdateWorkspace={handleUpdateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        isEmbed={false}
        initialTab={workspaceSettingsInitialTab}
        subscription={subscription}
        fetchSubscription={fetchSubscription}
        isMembersOnly={false}
        isSaasMode={saas?.isSaasMode}
      />

      {/* チャンネル設定モーダル */}
      <ChannelSettingsModal
        isOpen={!!selectedChannelToEdit}
        onClose={() => setSelectedChannelToEdit(null)}
        channel={selectedChannelToEdit}
        currentUserRole={currentUserRole}
        currentUserLedGroups={currentUserLedGroups}
        currentUserId={currentUser.id}
        currentUserDisplayName={currentUser.displayName}
        onUpdateChannel={handleUpdateChannel}
        onDeleteChannel={handleDeleteChannel}
        onLeaveChannel={handleLeaveChannel}
        isJoined={channels.some(c => c.id === selectedChannelToEdit?.id)}
      />

      {/* DM開始メンバー選択モーダル */}
      <StartDmModal
        isOpen={isStartDmOpen}
        onClose={() => setIsStartDmOpen(false)}
        workspaceId={activeWorkspaceId}
        currentUserId={currentUser.id}
        onCreateDm={handleCreateDm}
      />

      {/* ワークスペース新規作成モーダル */}
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceOpen}
        onClose={() => setIsCreateWorkspaceOpen(false)}
        onCreateWorkspace={handleCreateWorkspace}
      />

      {/* チャンネル新規追加モーダル */}
      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        onClose={() => {
          setIsCreateChannelOpen(false);
          setDefaultGroupIdForNewChannel(undefined);
        }}
        workspaceId={activeWorkspaceId}
        onCreateChannel={handleCreateChannel}
        defaultGroupId={defaultGroupIdForNewChannel}
      />

      {/* チャンネルブラウズモーダル */}
      <BrowseChannelsModal
        isOpen={isBrowseChannelsOpen}
        onClose={() => setIsBrowseChannelsOpen(false)}
        workspaceId={activeWorkspaceId}
        currentUserRole={currentUserRole}
        currentUserLedGroups={currentUserLedGroups}
        onJoinChannel={handleJoinChannel}
        onOpenChannelSettings={(channel) => setSelectedChannelToEdit(channel)}
      />

      {/* SaaS制限警告モーダル */}
      {saas?.saasLimitModal ? (
        <saas.saasLimitModal
          isOpen={limitModalOpen}
          onClose={() => setLimitModalOpen(false)}
          limitType={limitModalType}
          limitValue={limitModalValue}
          onGoToSubscription={() => {
            setWorkspaceSettingsInitialTab('subscription');
            setIsWorkspaceSettingsModalOpen(true);
          }}
        />
      ) : null}
    </>
  );
};

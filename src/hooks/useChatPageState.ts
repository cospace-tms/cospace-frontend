import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat, Message, User } from './useChat';
import { usePolling } from './usePolling';
import { apiClient } from '../utils/apiClient';
import { useLanguage } from '../utils/i18n';

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  description?: string;
  type?: string;
  groupId?: string | null;
  updatedAt?: string | null;
  unreadCount?: number;
}

interface Workspace {
  id: string;
  name: string;
  custom_statuses?: string;
}

interface Notification {
  id: string;
  workspaceId: string;
  senderId?: string | null;
  type: string;
  title: string;
  content: string;
  linkUrl?: string | null;
  isRead: number;
  isArchived: number;
  createdAt: string;
  sender?: {
    displayName: string;
    avatarUrl?: string | null;
  } | null;
}

interface UseChatPageStateProps {
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
  onUpdateUser: (displayName: string, avatarUrl: string | null, language: string) => void;
}

export const useChatPageState = ({
  currentUser,
  initialWorkspaceId,
  initialChannelId,
  onLogout,
  onUpdateUser,
}: UseChatPageStateProps) => {
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
    return localStorage.getItem(`cospace_last_workspace_${currentUser.id}`) || initialWorkspaceId;
  });
  const [activeView, setActiveView] = useState<'dashboard' | 'chat' | 'items' | 'inbox' | 'workspace_doc' | 'media' | 'workspace_settings'>(() => {
    const saved = localStorage.getItem(`cospace_last_view_${currentUser.id}`);
    const validViews = ['dashboard', 'chat', 'items', 'inbox', 'workspace_doc', 'media', 'workspace_settings'];
    if (saved && validViews.includes(saved)) {
      return saved as any;
    }
    return 'dashboard';
  });

  // ダッシュボード用ステート
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
      if (tasksRes.success && Array.isArray(tasksRes.data)) {
        setDashboardTasks(tasksRes.data);
      }
      if (actRes.success && Array.isArray(actRes.data)) {
        setDashboardActivities(actRes.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (!silent) setLoadingDashboard(false);
    }
  }, [currentUserRole]);

  const [channels, setChannels] = useState<Channel[]>([
    { id: initialChannelId, name: 'general', isPrivate: false }
  ]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(() => {
    const wsId = localStorage.getItem(`cospace_last_workspace_${currentUser.id}`) || initialWorkspaceId;
    return localStorage.getItem(`cospace_last_channel_${currentUser.id}_${wsId}`) || initialChannelId;
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
  const [selectedChannelToEdit, setSelectedChannelToEdit] = useState<Channel | null>(null);
  const [isStartDmOpen, setIsStartDmOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isBrowseChannelsOpen, setIsBrowseChannelsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [channelMembers, setChannelMembers] = useState<any[]>([]);

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
  } = useChat({
    channelId: activeChannelId || '',
    currentUser: chatUser,
    apiSendMessage,
  });

  // 4. メッセージフェッチロジック (ポーリングから呼び出す)
  const lastFetchedIdRef = useRef<string | null>(null);

  const fetchNewMessages = useCallback(async (): Promise<number> => {
    if (!activeChannelId) return 0;

    try {
      const params: Record<string, string> = {
        channel_id: activeChannelId,
      };
      if (lastFetchedIdRef.current) {
        params.last_id = lastFetchedIdRef.current;
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
  }, [activeChannelId]);

  // 最後に見ていたワークスペース、ビュー、チャンネルを自動保存
  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem(`cospace_last_workspace_${currentUser.id}`, activeWorkspaceId);
    }
  }, [activeWorkspaceId, currentUser.id]);

  useEffect(() => {
    if (activeView) {
      localStorage.setItem(`cospace_last_view_${currentUser.id}`, activeView);
    }
  }, [activeView, currentUser.id]);

  useEffect(() => {
    if (activeWorkspaceId && activeChannelId) {
      localStorage.setItem(`cospace_last_channel_${currentUser.id}_${activeWorkspaceId}`, activeChannelId);
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
          const guestDeniedViews = ['dashboard', 'workspace_doc', 'workspace_settings', 'items', 'media', 'inbox'];
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
          setWorkspaces(wsResponse.data);
          if (wsResponse.data.length > 0) {
            const initialWsId = activeWorkspaceId || wsResponse.data[0].id;
            setActiveWorkspaceId(initialWsId);
            fetchUserRole(initialWsId);
          }
        }
      } catch (err) {
        console.warn('Workspace API fallback to default:', err);
      }
    };
    loadSidebarData();
  }, []);

  // 選択されたワークスペース配下のチャンネル一覧とメンバー一覧のロード
  useEffect(() => {
    if (!activeWorkspaceId) return;

    const loadChannelsAndMembers = async () => {
      try {
        const chanResponse = await apiClient.get<{ success: boolean; data: Channel[] }>(
          `/api/workspaces/${activeWorkspaceId}/channels`,
          { last_reads: getLastReadsParam() }
        );
        if (chanResponse.success && Array.isArray(chanResponse.data)) {
          setChannels(chanResponse.data);
          
          // そのワークスペースで最後に見ていたチャンネルIDを取得
          const savedChanId = localStorage.getItem(`cospace_last_channel_${currentUser.id}_${activeWorkspaceId}`);
          const hasSavedChan = chanResponse.data.some(c => c.id === savedChanId);
          
          if (hasSavedChan && savedChanId) {
            setActiveChannelId(savedChanId);
          } else if (chanResponse.data.length > 0) {
            setActiveChannelId(chanResponse.data[0].id);
          } else {
            setActiveChannelId(null);
          }
        }
      } catch (err) {
        console.warn('Channels API fallback to default:', err);
      }

      try {
        const memResponse = await apiClient.get<{ success: boolean; data: any[] }>(
          `/api/workspaces/${activeWorkspaceId}/members`
        );
        if (memResponse.success && Array.isArray(memResponse.data)) {
          setWorkspaceMembers(memResponse.data);
        }
      } catch (err) {
        console.warn('Workspace members load error:', err);
      }
    };
    fetchUserRole(activeWorkspaceId);
    loadChannelsAndMembers();
    fetchWorkspaceDoc(activeWorkspaceId);
  }, [activeWorkspaceId, fetchUserRole, fetchWorkspaceDoc, currentUser.id]);

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

  // フィルター変更時に通知を自動ロード
  useEffect(() => {
    loadNotifications(inboxFilter);
  }, [inboxFilter, loadNotifications]);

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
        unreads[c.id] = false;
      } else if (c.updatedAt) {
        unreads[c.id] = new Date(c.updatedAt) > new Date(lastRead);
      } else {
        unreads[c.id] = false;
      }
    });
    setChannelUnreads(unreads);
  }, [channels, activeChannelId, activeView, currentUser]);

  // 定期的な通知およびチャンネル情報のリロード（ポーリング）
  useEffect(() => {
    loadNotifications();

    if (activeView === 'dashboard') {
      loadDashboardData(false);
    }

    const pollWorkspaces = async () => {
      try {
        const wsResponse = await apiClient.get<{ success: boolean; data: Workspace[] }>('/api/workspaces');
        if (wsResponse.success && Array.isArray(wsResponse.data)) {
          setWorkspaces(wsResponse.data);
        }
      } catch (err) {
        console.warn('Failed to poll workspaces:', err);
      }
    };
    pollWorkspaces();

    const interval = setInterval(() => {
      loadNotifications();

      if (activeWorkspaceId) {
        apiClient.get<{ success: boolean; data: Channel[] }>(
          `/api/workspaces/${activeWorkspaceId}/channels`,
          { last_reads: getLastReadsParam() }
        ).then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setChannels(res.data);
          }
        }).catch((err) => console.error('Failed to poll channels:', err));
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeWorkspaceId, activeView, loadNotifications, loadDashboardData]);

  // タブのタイトルを動的に更新
  useEffect(() => {
    const defaultTitle = 'cospace';
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

    const itemMatch = linkUrl.match(/\/items\?item=([^\&\s]+)/);
    if (itemMatch) {
      const itemId = itemMatch[1];
      setActiveView('items');
      setJumpItemId(itemId);
      return;
    }
  };

  const handleSelectWorkspaceFromDashboard = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveView('chat');
  };

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
    } else {
      throw new Error('Failed to create channel');
    }
  }, [activeWorkspaceId]);

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    toggleLocalReaction(messageId, emoji, chatUser);

    try {
      await apiClient.post<{ success: boolean }>(`/api/messages/${messageId}/reactions`, { emoji });
    } catch (err: any) {
      console.error('Failed to toggle reaction:', err);
      toggleLocalReaction(messageId, emoji, chatUser);
    }
  }, [toggleLocalReaction, chatUser]);

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
        }
      }
    } catch (err: any) {
      alert((t('error') === 'Error' ? 'Failed to join channel: ' : 'チャンネルへの参加に失敗しました: ') + (err.message || err));
    }
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;

  return {
    currentUserRole,
    currentUserLedGroups,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    activeView,
    setActiveView,
    dashboardTasks,
    dashboardActivities,
    loadingDashboard,
    loadDashboardData,
    channels,
    activeChannelId,
    setActiveChannelId,
    notifications,
    unreadNotificationsCount,
    loadingNotifications,
    channelUnreads,
    inboxFilter,
    setInboxFilter,
    jumpItemId,
    setJumpItemId,
    replyTargetMessage,
    setReplyTargetMessage,
    isProfileOpen,
    setIsProfileOpen,
    selectedChannelToEdit,
    setSelectedChannelToEdit,
    isStartDmOpen,
    setIsStartDmOpen,
    isCreateWorkspaceOpen,
    setIsCreateWorkspaceOpen,
    isCreateChannelOpen,
    setIsCreateChannelOpen,
    isBrowseChannelsOpen,
    setIsBrowseChannelsOpen,
    isCollapsed,
    setIsCollapsed,
    workspaceMembers,
    channelMembers,
    workspaceDocText,
    handleSaveWorkspaceDoc,
    messages,
    sendMessage,
    retryMessage,
    deleteFailedMessage,
    pollingInfo,
    handleJumpToLink,
    handleSelectWorkspaceFromDashboard,
    handleCreateWorkspace,
    handleCreateChannel,
    handleToggleReaction,
    handleUpdateProfile,
    handleUpdateWorkspace,
    handleDeleteWorkspace,
    handleUpdateChannel,
    handleCreateDm,
    handleDeleteChannel,
    handleLeaveChannel,
    handleJoinChannel,
    activeWorkspace,
    activeChannel,
    loadNotifications,
  };
};

import React, { useState, useEffect } from 'react';
import { SetupPage } from './pages/SetupPage';
import { ChatPage } from './pages/ChatPage';
import { apiClient } from './utils/apiClient';
import { LanguageProvider, useLanguage } from './utils/i18n';
import { Loader, AlertTriangle } from 'lucide-react';
import './global.css';
import { updateThemeColorMeta } from './utils/theme';

export interface SaasExtensions {
  isSaasMode?: boolean;
  isAdminPortalMode?: boolean;
  adminSetupRequired?: boolean;
  currentAdminPath?: string;
  isWorkspaceSuspended?: boolean;
  renderAdminDashboard?: (currentPath: string, adminSetupRequired: boolean, onSetupComplete: () => void) => React.ReactNode;
  renderPreparingScreen?: () => React.ReactNode;
  renderSuspendedScreen?: (onLogout: () => void) => React.ReactNode;
  checkWorkspaceLimit?: (workspaceCount: number) => { limitReached: boolean; message: string } | null;
  saasLimitModal?: React.ComponentType<{
    isOpen: boolean;
    onClose: () => void;
    limitType: 'channel' | 'workspace' | 'member' | 'storage' | null;
    limitValue?: number | string;
    onGoToSubscription?: () => void;
  }>;
  extraTabs?: any[];
}

export interface AppProps {
  saas?: SaasExtensions;
}

interface UserSession {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  workspaceId: string;
  defaultChannelId: string;
  token?: string;
  language?: string;
}

function AppContent({ saas }: AppProps) {
  const { language, setLanguage, t } = useLanguage();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // SaaS管理者ポータル関連の状態 (saas Props から取得)
  const isSaasMode = saas?.isSaasMode ?? false;
  const isAdminPortalMode = saas?.isAdminPortalMode ?? false;
  const currentAdminPath = saas?.currentAdminPath ?? '';
  const [adminSetupRequired, setAdminSetupRequired] = useState<boolean>(saas?.adminSetupRequired ?? false);
  const [isWorkspaceSuspended, setIsWorkspaceSuspended] = useState<boolean>(saas?.isWorkspaceSuspended ?? false);

  // Propsの変更を同期する
  useEffect(() => {
    if (saas?.adminSetupRequired !== undefined) {
      setAdminSetupRequired(saas.adminSetupRequired);
    }
  }, [saas?.adminSetupRequired]);

  useEffect(() => {
    if (saas?.isWorkspaceSuspended !== undefined) {
      setIsWorkspaceSuspended(saas.isWorkspaceSuspended);
    }
  }, [saas?.isWorkspaceSuspended]);

  // iOS Safari での入力欄解除時（focusout）にスクロール位置を自動補正（画面下部余白防止）
  useEffect(() => {
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      }
    };

    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // 新規登録 (サインアップ) 用の状態
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerRecoveryCode, setRegisterRecoveryCode] = useState<string | null>(null);
  const [registerCopied, setRegisterCopied] = useState(false);

  // ワークスペース選択用の状態
  const [userWorkspaces, setUserWorkspaces] = useState<any[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  // ログイン用の入力状態（セットアップ済み時の簡易ログイン用）
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // MFA (2段階認証) 用の状態
  const [mfaRequired, setMfaRequired] = useState(false);
  const [tempSessionId, setTempSessionId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);

  // パスワード復旧用の入力状態
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // PWA/ServiceWorker アップデート通知用の状態
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // 新しいService Workerを適用してページをリロードする処理
  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setShowUpdateBanner(false);

    let reloaded = false;
    const doReload = () => {
      if (!reloaded) {
        reloaded = true;
        window.location.reload();
      }
    };

    // 新しいSWがアクティブになった段階でページをリロード（一度だけ実行）
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true });
    }
    // controllerchangeが発火しない場合に備え1秒後に予備リロード
    setTimeout(doReload, 1000);
  };

  // 1. 初期状態チェック (サイレントリフレッシュによるセッション復元 & セットアップ要否判定)
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        // テーマの初期適用
        const cachedTheme = localStorage.getItem('cohive_theme') || 'dark';
        document.documentElement.classList.toggle('theme-light', cachedTheme === 'light');
        updateThemeColorMeta(cachedTheme === 'light' ? 'light' : 'dark');

        // サイレントリフレッシュによりアクセストークンを再取得してログイン状態を復元
        try {
          const refreshData = await apiClient.refreshAccessToken();
          const token = typeof refreshData === 'string' ? refreshData : refreshData?.token;
          
          let parsed: UserSession | null = null;
          const cachedSession = localStorage.getItem('cohive_session');
          if (cachedSession) {
            try { parsed = JSON.parse(cachedSession); } catch (e) {}
          }

          if (refreshData && typeof refreshData === 'object' && refreshData.id) {
            const updatedSession: UserSession = {
              id: refreshData.id,
              displayName: refreshData.displayName || parsed?.displayName || '',
              email: refreshData.email || parsed?.email || '',
              avatarUrl: refreshData.avatarUrl !== undefined ? refreshData.avatarUrl : (parsed?.avatarUrl || null),
              workspaceId: refreshData.workspaceId || parsed?.workspaceId || '',
              defaultChannelId: refreshData.defaultChannelId || parsed?.defaultChannelId || '',
              token: token,
              language: refreshData.language || parsed?.language || 'ja',
            };
            apiClient.setToken(token);
            apiClient.setWorkspaceId(updatedSession.workspaceId);
            apiClient.setUserId(updatedSession.id);
            setSession(updatedSession);
            localStorage.setItem('cohive_session', JSON.stringify(updatedSession));
            if (updatedSession.language === 'ja' || updatedSession.language === 'en') {
              setLanguage(updatedSession.language);
            }
          } else if (parsed && token) {
            apiClient.setToken(token);
            apiClient.setWorkspaceId(parsed.workspaceId);
            apiClient.setUserId(parsed.id);
            setSession(parsed);
            if (parsed.language === 'ja' || parsed.language === 'en') {
              setLanguage(parsed.language);
            }
          }
        } catch (refreshErr) {
          // リフレッシュに失敗した場合は未ログイン状態とする
          console.log('No active session found or refresh failed:', refreshErr);
          localStorage.removeItem('cohive_session');
          apiClient.setToken(null);
          apiClient.setWorkspaceId(null);
          apiClient.setUserId(null);
        }

        const response = await apiClient.get<{ setupRequired: boolean; adminSetupRequired?: boolean }>('/api/setup/status');
        setSetupRequired(isSaasMode ? false : response.setupRequired);
        setAdminSetupRequired(!!response.adminSetupRequired);
      } catch (err: any) {
        console.error('Failed to get setup status:', err);
        setError(t('error') === 'Error' ? 'Failed to connect to Workers backend. Please make sure the server is running.' : 'Workers バックエンドへの接続に失敗しました。サーバーが起動しているか確認してください。');
      } finally {
        setLoading(false);
      }
    };

    checkSetupStatus();
  }, []);

  // グローバルなログアウトイベントの購読
  useEffect(() => {
    const handleGlobalLogout = () => {
      handleLogout();
    };

    window.addEventListener('auth:logout', handleGlobalLogout);
    return () => {
      window.removeEventListener('auth:logout', handleGlobalLogout);
    };
  }, []);

  // ワークスペース一時停止イベントの購読
  useEffect(() => {
    const handleWorkspaceSuspended = () => {
      setIsWorkspaceSuspended(true);
    };

    window.addEventListener('workspace:suspended', handleWorkspaceSuspended);
    return () => {
      window.removeEventListener('workspace:suspended', handleWorkspaceSuspended);
    };
  }, []);

  // 新規登録 (サインアップ) 送信ハンドラー
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    // バリデーション
    if (!registerEmail || !registerPassword || !registerDisplayName) {
      setRegisterError(t('setup.errorRequired'));
      return;
    }

    const hasUpperCase = /[A-Z]/.test(registerPassword);
    const hasLowerCase = /[a-z]/.test(registerPassword);
    const hasNumbers = /\d/.test(registerPassword);
    const hasNonalphas = /[^A-Za-z0-9]/.test(registerPassword);

    if (registerPassword.length < 8 || !(hasUpperCase && hasLowerCase && hasNumbers && hasNonalphas)) {
      setRegisterError(t('setup.errorPassword'));
      return;
    }

    setRegisterLoading(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: {
          userId: string;
          recoveryCode: string;
        };
      }>('/api/auth/register', {
        email: registerEmail,
        password: registerPassword,
        displayName: registerDisplayName,
        language: language,
      });

      if (response.success && response.data) {
        setRegisterRecoveryCode(response.data.recoveryCode);
      } else {
        setRegisterError(t('error') === 'Error' ? 'Registration failed.' : 'アカウント登録に失敗しました。');
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setRegisterError(err.message || (t('error') === 'Error' ? 'An error occurred during registration.' : 'アカウント登録の実行中にエラーが発生しました。'));
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRegisterRecoveryComplete = () => {
    setRegisterRecoveryCode(null);
    setEmail(registerEmail);
    setPassword('');
    setShowRegister(false);
    setRegisterEmail('');
    setRegisterPassword('');
    setRegisterDisplayName('');
  };

  // ワークスペース一覧の自動フェッチ (ログイン済みかつ未所属時のみ)
  useEffect(() => {
    if (session && !session.workspaceId) {
      const fetchUserWorkspaces = async () => {
        setLoadingWorkspaces(true);
        setWorkspacesError(null);
        try {
          const response = await apiClient.get<{ success: boolean; data: any[] }>('/api/workspaces');
          if (response.success && Array.isArray(response.data)) {
            setUserWorkspaces(response.data);
          }
        } catch (err: any) {
          console.error('Failed to fetch workspaces:', err);
          setWorkspacesError(err.message || 'ワークスペース一覧の取得に失敗しました。');
        } finally {
          setLoadingWorkspaces(false);
        }
      };
      fetchUserWorkspaces();
    }
  }, [session]);

  const handleSelectWorkspace = async (workspaceId: string) => {
    if (!session) return;
    setLoadingWorkspaces(true);
    setWorkspacesError(null);
    try {
      const channelsRes = await apiClient.get<{ success: boolean; data: any[] }>(`/api/workspaces/${workspaceId}/channels`);
      let defaultChannelId = "";
      if (channelsRes.success && channelsRes.data && channelsRes.data.length > 0) {
        defaultChannelId = channelsRes.data[0].id;
      }

      const newSession = {
        ...session,
        workspaceId,
        defaultChannelId,
      };

      localStorage.setItem('cohive_session', JSON.stringify(newSession));
      apiClient.setWorkspaceId(workspaceId);
      setSession(newSession);
    } catch (err: any) {
      console.error('Failed to select workspace:', err);
      setWorkspacesError(err.message || 'ワークスペースの選択に失敗しました。');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleCreateWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !session) return;

    if (saas?.checkWorkspaceLimit) {
      const limit = saas.checkWorkspaceLimit(userWorkspaces.length);
      if (limit?.limitReached) {
        setWorkspacesError(limit.message);
        return;
      }
    }

    setCreatingWorkspace(true);
    setWorkspacesError(null);
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: { id: string; name: string };
      }>('/api/workspaces', { name: newWorkspaceName });

      if (response.success && response.data) {
        const workspaceId = response.data.id;
        const channelsRes = await apiClient.get<{ success: boolean; data: any[] }>(`/api/workspaces/${workspaceId}/channels`);
        let defaultChannelId = "";
        if (channelsRes.success && channelsRes.data && channelsRes.data.length > 0) {
          defaultChannelId = channelsRes.data[0].id;
        }

        const newSession = {
          ...session,
          workspaceId,
          defaultChannelId,
        };

        localStorage.setItem('cohive_session', JSON.stringify(newSession));
        apiClient.setWorkspaceId(workspaceId);
        setSession(newSession);
        setNewWorkspaceName('');
      }
    } catch (err: any) {
      console.error('Failed to create workspace:', err);
      setWorkspacesError(err.message || 'ワークスペースの作成に失敗しました。');
    } finally {
      setCreatingWorkspace(false);
    }
  };

  // 2. セットアップ完了時のハンドラー
  const handleSetupComplete = (data: {
    userId: string;
    workspaceId: string;
    defaultChannelId: string;
    userEmail: string;
    displayName: string;
    token?: string;
    language?: string;
  }) => {
    const newSession: UserSession = {
      id: data.userId,
      displayName: data.displayName,
      email: data.userEmail,
      workspaceId: data.workspaceId,
      defaultChannelId: data.defaultChannelId,
      token: data.token,
      language: data.language,
    };

    localStorage.setItem('cohive_session', JSON.stringify(newSession));
    apiClient.setWorkspaceId(data.workspaceId);
    apiClient.setUserId(data.userId);
    if (data.token) {
      apiClient.setToken(data.token);
    }
    setIsWorkspaceSuspended(false);
    setSession(newSession);
    if (data.language === 'ja' || data.language === 'en') {
      setLanguage(data.language);
    }
    setSetupRequired(false);
  };

  // 3. ログイン完了時のハンドラー
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const response = await apiClient.post<{
        success: boolean;
        data: UserSession & { mfaRequired?: boolean; tempSessionId?: string };
      }>('/api/auth/login', { email, password });

      if (response.success && response.data) {
        if (response.data.mfaRequired) {
          setMfaRequired(true);
          setTempSessionId(response.data.tempSessionId || '');
          setMfaCode('');
          setMfaError(null);
          return;
        }

        localStorage.setItem('cohive_session', JSON.stringify(response.data));
        apiClient.setWorkspaceId(response.data.workspaceId);
        apiClient.setUserId(response.data.id);
        if (response.data.token) {
          apiClient.setToken(response.data.token);
        }
        setSession(response.data);
        if (response.data.language === 'ja' || response.data.language === 'en') {
          setLanguage(response.data.language);
        }
        return;
      }
    } catch (err: any) {
      setLoginError(err.message || (t('error') === 'Error' ? 'Login failed.' : 'ログインに失敗しました。'));
    } finally {
      setLoginLoading(false);
    }
  };

  // 3-2. MFA (2段階認証) 検証ハンドラー
  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    setMfaLoading(true);

    try {
      const response = await apiClient.post<{
        success: boolean;
        data: UserSession;
      }>('/api/auth/login/verify', { tempSessionId, code: mfaCode });

      if (response.success && response.data) {
        localStorage.setItem('cohive_session', JSON.stringify(response.data));
        apiClient.setWorkspaceId(response.data.workspaceId);
        apiClient.setUserId(response.data.id);
        if (response.data.token) {
          apiClient.setToken(response.data.token);
        }
        setSession(response.data);
        if (response.data.language === 'ja' || response.data.language === 'en') {
          setLanguage(response.data.language);
        }
        setMfaRequired(false);
        setTempSessionId('');
        setMfaCode('');
        return;
      }
    } catch (err: any) {
      setMfaError(err.message || (t('error') === 'Error' ? 'Verification failed.' : '認証コードが正しくないか、期限が切れています。'));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaCancel = () => {
    setMfaRequired(false);
    setTempSessionId('');
    setMfaCode('');
    setMfaError(null);
  };

  // 4. リカバリーコードによるパスワード再設定ハンドラー
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoverySuccess(null);

    if (newPassword.length < 8) {
      setRecoveryError(t('profile.pwFormatError'));
      return;
    }

    setRecoveryLoading(true);

    try {
      const response = await apiClient.post<{
        success: boolean;
        message: string;
        data: UserSession;
      }>('/api/auth/recovery', {
        email: recoveryEmail,
        recoveryCode: recoveryCode.trim(),
        newPassword,
      });

      if (response.success && response.data) {
        setRecoverySuccess(t('recovery.success'));

        // ログイン処理と同様にセッションを確立
        setTimeout(() => {
          localStorage.setItem('cohive_session', JSON.stringify(response.data));
          apiClient.setWorkspaceId(response.data.workspaceId);
          apiClient.setUserId(response.data.id);
          if (response.data.token) {
            apiClient.setToken(response.data.token);
          }
          setSession(response.data);
          if (response.data.language === 'ja' || response.data.language === 'en') {
            setLanguage(response.data.language);
          }
          setShowRecovery(false);
          setRecoveryEmail('');
          setRecoveryCode('');
          setNewPassword('');
          setRecoverySuccess(null);
        }, 1500);
      }
    } catch (err: any) {
      console.error('Recovery failed:', err);
      setRecoveryError(err.message || (t('recovery.backToLogin') === 'Back to Login' ? 'Failed to reset password. Please check your recovery code.' : 'パスワードの再設定に失敗しました。リカバリーコードを確認してください。'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const isLoggingOutRef = React.useRef(false);

  const handleLogout = async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    try {
      try {
        await apiClient.post('/api/auth/logout');
      } catch (err) {
        console.warn('Backend logout failed:', err);
      }
      localStorage.removeItem('cohive_session');
      apiClient.setWorkspaceId(null);
      apiClient.setUserId(null);
      apiClient.setToken(null);
      setIsWorkspaceSuspended(false);
      setSession(null);
      // ログアウト時に再度セットアップチェック
      setLoading(true);
      const res = await apiClient.get<{ setupRequired: boolean }>('/api/setup/status');
      setSetupRequired(res.setupRequired);
    } catch (err) {
      console.error('Failed to get setup status during logout:', err);
      setError(t('error') === 'Error' ? 'Failed to connect to Workers backend. Please make sure the server is running.' : 'Workers バックエンドへの接続に失敗しました。サーバーが起動しているか確認してください。');
    } finally {
      setLoading(false);
      isLoggingOutRef.current = false;
    }
  };

  const handleUpdateSession = (displayName: string, avatarUrl: string | null, language?: string, email?: string) => {
    if (!session) return;
    const newSession = { ...session, displayName, avatarUrl, language, email: email || session.email };
    localStorage.setItem('cohive_session', JSON.stringify(newSession));
    setSession(newSession);
    if (language === 'ja' || language === 'en') {
      setLanguage(language);
    }
  };

  // 1. Service Worker の登録とアプリ更新（バージョン確認）の監視
  useEffect(() => {
    if (loading) return;

    const setupServiceWorker = async () => {
      if (!('serviceWorker' in navigator)) {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // 新しい Service Worker が存在するか確認するハンドラ
        const handleUpdate = (reg: ServiceWorkerRegistration) => {
          if (!reg) return;
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // 新しいSWがインストール完了し、待機状態に入った場合
                  setWaitingWorker(newWorker);
                  setShowUpdateBanner(true);
                }
              });
            }
          });

          // すでにロード時点で待機中の新しいSWが存在する場合
          if (reg.waiting) {
            setWaitingWorker(reg.waiting);
            setShowUpdateBanner(true);
          }
        };

        handleUpdate(registration);

        // 起動時に明示的に更新があるか確認する
        try {
          await registration.update();
        } catch (updateErr) {
          console.warn('Failed to trigger service worker update check:', updateErr);
        }
      } catch (err) {
        console.error('Failed to register service worker:', err);
      }
    };

    setupServiceWorker();
  }, [loading]);

  // 2. プッシュ通知の購読セットアップ
  useEffect(() => {
    if (loading || !session || isAdminPortalMode) return;

    const setupPushNotifications = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push notifications are not supported in this browser.');
        return;
      }

      try {
        // 登録済みの Service Worker 登録オブジェクトを取得
        const registration = await navigator.serviceWorker.ready;

        // 通知の許可状況を確認し、必要に応じて許可を求める
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.log('Push permission denied.');
            return;
          }
        } else if (Notification.permission === 'denied') {
          console.warn('Push permission is denied by user.');
          return;
        }

        // VAPID公開鍵の取得
        const { publicKey } = await apiClient.get<{ publicKey: string }>('/api/push/vapid-public-key');

        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const convertedVapidKey = urlBase64ToUint8Array(publicKey);

        // 購読オブジェクトの取得・作成
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }

        // バックエンドにサブスクリプションを送信
        const subJson = subscription.toJSON();
        await apiClient.post('/api/push/subscribe', {
          subscription: {
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth
            }
          }
        });
        console.log('Successfully registered push subscription with backend.');
      } catch (err) {
        console.error('Failed to setup push notifications:', err);
      }
    };

    setupPushNotifications();
  }, [loading, session, isAdminPortalMode]);

  // SaaS管理者ポータルのレンダリング分岐
  if (loading) {
    return (
      <div className="setup-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main, #0f172a)' }}>
        <Loader className="animate-spin" size={32} style={{ color: 'var(--accent-primary, #0ea5e9)' }} />
      </div>
    );
  }

  if (isAdminPortalMode === true) {
    if (saas?.renderAdminDashboard) {
      return saas.renderAdminDashboard(
        currentAdminPath,
        adminSetupRequired,
        () => {}
      );
    }
    return null;
  }

  // SaaS管理者未登録時の一般ユーザー向け準備中画面
  if (isSaasMode && adminSetupRequired) {
    return (
      <div className="setup-container">
        <div className="setup-card" style={{ textAlign: 'center', maxWidth: '460px', padding: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', padding: '16px', borderRadius: '50%', display: 'inline-flex' }}>
              <Loader size={32} />
            </div>
          </div>
          <h2 className="setup-title" style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px 0' }}>
            {language === 'ja' ? 'システム準備中' : 'System Preparing'}
          </h2>
          <p className="setup-subtitle" style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-muted, #9ca3af)', margin: 0 }}>
            {language === 'ja' 
              ? 'CoHiveシステムは現在初期セットアップ中です。運営者の準備が完了するまでしばらくお待ちください。' 
              : 'CoHive system is currently under initial setup. Please wait until the operator completes configuration.'}
          </p>
        </div>
      </div>
    );
  }

  // SaaSワークスペース一時停止画面の割り込み描画
  if (isSaasMode && isWorkspaceSuspended) {
    return (
      <div className="setup-container">
        <div className="setup-card" style={{ textAlign: 'center', maxWidth: '480px', padding: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '16px', borderRadius: '50%', display: 'inline-flex' }}>
              <AlertTriangle size={32} />
            </div>
          </div>
          <h2 className="setup-title" style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px 0', color: '#ef4444' }}>
            {language === 'ja' ? 'ワークスペース一時停止中' : 'Workspace Suspended'}
          </h2>
          <p className="setup-subtitle" style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-muted, #9ca3af)', margin: '0 0 24px 0' }}>
            {language === 'ja' 
              ? 'このワークスペースはシステム管理者によって一時停止されています。詳細につきましては運営者またはサポート窓口までお問い合わせください。' 
              : 'This workspace has been suspended by the administrator. Please contact support for more details.'}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setIsWorkspaceSuspended(false);
              handleLogout();
            }}
            style={{ width: '100%' }}
          >
            {language === 'ja' ? 'ログアウトして戻る' : 'Logout & Return'}
          </button>
        </div>
      </div>
    );
  }

  // 5. ローディング画面
  if (loading) {
    return (
      <div className="setup-container">
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', color: 'var(--text-muted)' }}>{t('connection.checking')}</p>
        </div>
      </div>
    );
  }

  // 6. 接続エラー画面
  if (error && setupRequired === null) {
    return (
      <div className="setup-container">
        <div className="setup-card" style={{ textAlign: 'center' }}>
          <h2 className="setup-title" style={{ color: 'var(--accent-danger)' }}>{t('connection.error')}</h2>
          <p className="setup-subtitle" style={{ margin: '16px 0 24px' }}>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t('connection.retry')}
          </button>
        </div>
      </div>
    );
  }

  // 7. 初期セットアップが必要な場合
  if (setupRequired) {
    return <SetupPage onSetupComplete={handleSetupComplete} />;
  }

  // 8. ログインが必要な場合（セッションがない場合）
  if (!session) {
    const renderLangSelector = () => (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 20px', position: 'absolute', top: 10, right: 10 }}>
        <button
          onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
          className="btn btn-secondary"
          style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
        >
          {language === 'ja' ? 'English' : '日本語'}
        </button>
      </div>
    );

    if (registerRecoveryCode) {
      return (
        <div className="setup-container" style={{ position: 'relative' }}>
          {renderLangSelector()}
          <div className="setup-card" style={{ maxWidth: '520px', textAlign: 'center' }}>
            <h2 className="setup-title" style={{ color: 'var(--text-danger, #ef4444)' }}>
              {t('register.recoveryTitle')}
            </h2>
            <p className="setup-subtitle" style={{ marginBottom: '20px' }}>
              {t('register.recoverySubtitle')}
            </p>

            <div style={{
              background: 'var(--bg-secondary, #f3f4f6)',
              border: '2px dashed var(--border-color, #e5e7eb)',
              borderRadius: '8px',
              padding: '20px',
              fontSize: '22px',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              fontWeight: 'bold',
              color: 'var(--text-primary, #1f2937)',
              margin: '20px 0',
              userSelect: 'all',
              wordBreak: 'break-all'
            }}>
              {registerRecoveryCode}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(registerRecoveryCode);
                  setRegisterCopied(true);
                  setTimeout(() => setRegisterCopied(false), 2000);
                }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                {registerCopied ? t('setup.copied') : t('setup.copyCode')}
              </button>
            </div>

            <button
              onClick={handleRegisterRecoveryComplete}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              {t('register.startApp')}
            </button>
          </div>
        </div>
      );
    }

    if (showRegister) {
      return (
        <div className="setup-container" style={{ position: 'relative' }}>
          {renderLangSelector()}
          <div className="setup-card">
            <h2 className="setup-title">{t('register.title')}</h2>
            <p className="setup-subtitle">{t('register.subtitle')}</p>

            {registerError && <div className="alert-error" style={{ marginBottom: '15px' }}>{registerError}</div>}

            <form onSubmit={handleRegisterSubmit}>
              <div className="form-group">
                <label className="form-label">{t('register.displayName')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="John Doe"
                  value={registerDisplayName}
                  onChange={(e) => setRegisterDisplayName(e.target.value)}
                  required
                  disabled={registerLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('register.email')}</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="john@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                  disabled={registerLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('register.password')}</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  disabled={registerLoading}
                />
                <p className="form-help" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {t('setup.passwordHelp')}
                </p>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={registerLoading}>
                {registerLoading ? t('register.loading') : t('register.submit')}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '15px' }}>
              <button
                onClick={() => {
                  setShowRegister(false);
                  setRegisterError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-link, #4f46e5)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textDecoration: 'underline'
                }}
              >
                {t('register.backToLogin')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (mfaRequired) {
      return (
        <div className="setup-container" style={{ position: 'relative' }}>
          {renderLangSelector()}
          <div className="setup-card" style={{ maxWidth: '400px' }}>
            <h2 className="setup-title">{language === 'ja' ? '2段階認証' : 'Two-Factor Authentication'}</h2>
            <p className="setup-subtitle">
              {language === 'ja'
                ? '登録されたメールアドレス宛てに送信された6桁の認証コードを入力してください。'
                : 'Please enter the 6-digit verification code sent to your registered email address.'}
            </p>

            {mfaError && <div className="alert-error" style={{ marginBottom: '15px' }}>{mfaError}</div>}

            <form onSubmit={handleMfaSubmit}>
              <div className="form-group">
                <label className="form-label">{language === 'ja' ? '認証コード' : 'Verification Code'}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="123456"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  required
                  disabled={mfaLoading}
                  style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '4px' }}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={mfaLoading || mfaCode.length !== 6}>
                {mfaLoading
                  ? (language === 'ja' ? '認証中...' : 'Verifying...')
                  : (language === 'ja' ? '確認' : 'Verify')}
              </button>
            </form>

            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={handleMfaCancel}
              disabled={mfaLoading}
            >
              {language === 'ja' ? 'ログイン画面に戻る' : 'Back to Login'}
            </button>
          </div>
        </div>
      );
    }

    if (showRecovery) {
      return (
        <div className="setup-container" style={{ position: 'relative' }}>
          {renderLangSelector()}
          <div className="setup-card" style={{ maxWidth: '500px' }}>
            <h2 className="setup-title">{t('recovery.title')}</h2>
            <p className="setup-subtitle">{t('recovery.subtitle')}</p>

            {recoveryError && <div className="alert-error" style={{ marginBottom: '15px' }}>{recoveryError}</div>}
            {recoverySuccess && <div className="alert-success" style={{
              background: 'rgba(16, 185, 129, 0.1)',
              borderLeft: '4px solid #10b981',
              padding: '12px',
              borderRadius: '4px',
              color: '#10b981',
              fontSize: '13px',
              marginBottom: '15px',
              textAlign: 'center'
            }}>{recoverySuccess}</div>}

            {/* 管理者向けリカバリーフォーム */}
            <form onSubmit={handleRecoverySubmit}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '15px 0 10px', color: 'var(--text-primary)' }}>
                {t('recovery.ownerTitle')}
              </h3>

              <div className="form-group">
                <label className="form-label">{t('recovery.email')}</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="admin@example.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  required
                  disabled={recoveryLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('recovery.code')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  required
                  disabled={recoveryLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('recovery.newPassword')}</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={recoveryLoading}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={recoveryLoading}>
                {recoveryLoading ? t('recovery.submitting') : t('recovery.submit')}
              </button>
            </form>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #e5e7eb)', margin: '20px 0' }} />

            {/* 一般メンバー向けの案内 */}
            <div style={{
              background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              padding: '15px',
              borderRadius: '6px',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--text-muted, #9ca3af)',
              marginBottom: '20px'
            }}>
              <strong style={{ color: 'var(--text-primary, #ffffff)', display: 'block', marginBottom: '4px' }}>
                {t('recovery.memberNoticeTitle')}
              </strong>
              {t('recovery.memberNoticeText')}
            </div>

            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                setShowRecovery(false);
                setRecoveryError(null);
                setRecoverySuccess(null);
              }}
              disabled={recoveryLoading}
            >
              {t('recovery.backToLogin')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="setup-container" style={{ position: 'relative' }}>
        {renderLangSelector()}
        <div className="setup-card">
          <h2 className="setup-title">{t('login.title')}</h2>
          <p className="setup-subtitle">{t('login.subtitle')}</p>

          {loginError && <div className="alert-error" style={{ marginBottom: '15px' }}>{loginError}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">{t('login.email')}</label>
              <input
                type="email"
                className="form-input"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loginLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('login.password')}</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginLoading}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loginLoading}>
              {loginLoading ? t('login.loading') : t('login.submit')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => {
                setShowRecovery(true);
                setRecoveryEmail(email); // 入力済みのメールを引き継ぐ
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #9ca3af)',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline'
              }}
            >
              {t('login.forgotPassword')}
            </button>

            {isSaasMode && (
              <>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: '10px 0 5px', 
                  color: 'var(--border-color, rgba(255,255,255,0.08))' 
                }}>
                  <div style={{ flex: 1, borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}></div>
                  <span style={{ padding: '0 8px', fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>or</span>
                  <div style={{ flex: 1, borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}></div>
                </div>

                <button
                  onClick={() => {
                    setShowRegister(true);
                    setRegisterEmail(email);
                  }}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {t('login.goToRegister')}
                </button>
              </>
            )}
          </div>
        </div>

        {showUpdateBanner && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 9999,
            maxWidth: '320px',
            color: '#fff',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', lineHeight: '1.4' }}>
              {language === 'ja' ? '新しいバージョンが利用可能です。' : 'A new version is available.'}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.4' }}>
              {language === 'ja' ? 'チャットの安定性を保つため、最新の更新を適用してください。' : 'Please apply the latest updates to keep chat stable.'}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowUpdateBanner(false)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {language === 'ja' ? '後で' : 'Later'}
              </button>
              <button
                onClick={handleApplyUpdate}
                style={{
                  background: 'var(--accent-primary, #4f46e5)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '11px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {language === 'ja' ? '今すぐ更新' : 'Update Now'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 10. ワークスペース選択・作成画面
  if (session && !session.workspaceId) {
    const renderLangSelector = () => (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 20px', position: 'absolute', top: 10, right: 10 }}>
        <button
          onClick={() => setLanguage(language === 'ja' ? 'en' : 'ja')}
          className="btn btn-secondary"
          style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
        >
          {language === 'ja' ? 'English' : '日本語'}
        </button>
      </div>
    );

    return (
      <div className="setup-container" style={{ position: 'relative' }}>
        {renderLangSelector()}
        <div className="setup-card" style={{ maxWidth: '500px' }}>
          <h2 className="setup-title">{t('workspace.select.title')}</h2>
          <p className="setup-subtitle">{t('workspace.select.subtitle')}</p>

          {workspacesError && <div className="alert-error" style={{ marginBottom: '15px' }}>{workspacesError}</div>}

          {/* ワークスペース一覧 */}
          <div style={{ marginBottom: '25px' }}>
            {loadingWorkspaces ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('loading')}</p>
            ) : userWorkspaces.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0' }}>
                {t('workspace.select.empty')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', padding: '5px' }}>
                {userWorkspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws.id)}
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{ws.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {ws.unreadCount > 0 ? `${ws.unreadCount} unread` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color, #e5e7eb)', margin: '20px 0' }} />

          {/* 新規作成フォーム */}
          {saas?.checkWorkspaceLimit && saas.checkWorkspaceLimit(userWorkspaces.length)?.limitReached ? (
            <div style={{
              padding: '12px',
              borderRadius: '6px',
              background: 'rgba(14, 165, 233, 0.05)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
              color: 'var(--text-muted, #9ca3af)',
              fontSize: '13px',
              lineHeight: '1.5',
              textAlign: 'center'
            }}>
              {saas.checkWorkspaceLimit(userWorkspaces.length)?.message}
            </div>
          ) : (
            <form onSubmit={handleCreateWorkspaceSubmit}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--text-primary)' }}>
                {t('workspace.select.createTitle')}
              </h3>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('workspace.select.createPlaceholder')}
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  required
                  disabled={creatingWorkspace}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px' }}
                disabled={creatingWorkspace || !newWorkspaceName.trim()}
              >
                {creatingWorkspace ? t('loading') : t('workspace.select.createBtn')}
              </button>
            </form>
          )}

          {/* ログアウト用の退避導線 */}
          <div style={{ textAlign: 'center', marginTop: '20px', borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: '15px' }}>
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {t('sidebar.logout')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 9. 通常チャット画面の表示
  return (
    <>
      <ChatPage
        currentUser={session}
        initialWorkspaceId={session.workspaceId}
        initialChannelId={session.defaultChannelId}
        onLogout={handleLogout}
        onUpdateUser={handleUpdateSession}
        saas={saas}
      />
      {showUpdateBanner && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 9999,
          maxWidth: '320px',
          color: '#fff',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', lineHeight: '1.4' }}>
            {language === 'ja' ? '新しいバージョンが利用可能です。' : 'A new version is available.'}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.4' }}>
            {language === 'ja' ? 'チャットの安定性を保つため、最新の更新を適用してください。' : 'Please apply the latest updates to keep chat stable.'}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowUpdateBanner(false)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: '#fff',
                fontSize: '11px',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {language === 'ja' ? '後で' : 'Later'}
            </button>
            <button
              onClick={handleApplyUpdate}
              style={{
                background: 'var(--accent-primary, #4f46e5)',
                border: 'none',
                color: '#fff',
                fontSize: '11px',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {language === 'ja' ? '今すぐ更新' : 'Update Now'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function App({ saas }: AppProps) {
  return (
    <LanguageProvider>
      <AppContent saas={saas} />
    </LanguageProvider>
  );
}

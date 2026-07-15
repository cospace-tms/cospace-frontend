import React, { useState, useEffect } from 'react';
import { X, Upload, Loader } from 'lucide-react';
import { apiClient } from '../utils/apiClient';
import { useLanguage } from '../utils/i18n';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string | null;
    language?: string;
  };
  onUpdateProfile: (displayName: string, avatarUrl: string | null, language: string) => Promise<void>;
  onUpdateEmail?: (email: string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
  onUpdateEmail,
}) => {
  const { setLanguage: setGlobalLanguage, t } = useLanguage();
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser.avatarUrl || null);
  const [profileLang, setProfileLang] = useState<string>(currentUser.language || 'ja');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('cohive_theme') as 'light' | 'dark') || 'dark';
  });

  // パスワード変更ステート
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // メールアドレス変更ステート
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false);
  const [emailChangeStep, setEmailChangeStep] = useState<'request' | 'verify'>('request');
  const [emailChangeMessage, setEmailChangeMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(currentUser.displayName);
      setAvatarUrl(currentUser.avatarUrl || null);
      setProfileLang(currentUser.language || 'ja');
      setTheme((localStorage.getItem('cohive_theme') as 'light' | 'dark') || 'dark');
      // モーダルを開いた時にパスワード入力をリセット
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(null);

      // メール変更用の状態を初期化
      setShowEmailChange(false);
      setNewEmail('');
      setEmailPassword('');
      setVerificationCode('');
      setEmailChangeStep('request');
      setEmailChangeMessage(null);
      setEmailChangeLoading(false);

      // SMTP設定の有無や保留中の要求を確認
      apiClient.get<{ success: boolean; isSmtpConfigured: boolean; pendingChange: { newEmail: string; expiresAt: string } | null }>('/api/users/email-change-status')
        .then(res => {
          if (res.success) {
            setIsSmtpConfigured(res.isSmtpConfigured);
            if (res.pendingChange) {
              setNewEmail(res.pendingChange.newEmail);
              setEmailChangeStep('verify');
              setShowEmailChange(true);
            }
          }
        })
        .catch(err => {
          console.error('Failed to get email change status:', err);
        });
    }
  }, [isOpen, currentUser]);

  // プッシュ通知ステート
  const [pushStatus, setPushStatus] = useState<'granted' | 'default' | 'denied' | 'unsupported'>('default');
  const [hasSubscription, setHasSubscription] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 購読状態の確認
  const checkPushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    setPushStatus(Notification.permission);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setHasSubscription(!!subscription);
    } catch (err) {
      console.error('Failed to check push subscription:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkPushSubscription();
      setPushMessage(null);
    }
  }, [isOpen]);

  // プッシュ通知を手動で有効化（iOSなどの直接インタラクション対策）
  const handleEnablePush = async () => {
    setPushLoading(true);
    setPushMessage(null);

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('このブラウザはプッシュ通知に対応していません。');
      }

      // 許可を求める
      const permission = await Notification.requestPermission();
      setPushStatus(permission);
      if (permission !== 'granted') {
        throw new Error('通知の権限が拒否されました。ブラウザの設定から許可してください。');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      
      // 既存の古い鍵での購読オブジェクトがあれば、一度明示的に解除する
      try {
        const activeSub = await registration.pushManager.getSubscription();
        if (activeSub) {
          console.log('Unsubscribing from existing push subscription before resubscribing.');
          await activeSub.unsubscribe();
        }
      } catch (subErr) {
        console.warn('Failed to unsubscribe existing push:', subErr);
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
      
      // 購読を作成
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // バックエンドに送信
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

      setHasSubscription(true);
      setPushMessage({ text: 'プッシュ通知の購読登録が完了しました！', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setPushMessage({ text: err.message || 'プッシュ通知の設定に失敗しました。', type: 'error' });
    } finally {
      setPushLoading(false);
    }
  };

  // テストプッシュ通知の送信
  const handleTestPush = async () => {
    setPushLoading(true);
    setPushMessage(null);
    try {
      const res = await apiClient.post<{ success: boolean; message?: string; error?: string }>('/api/push/test', {});
      if (res.success) {
        setPushMessage({ text: res.message || 'テスト通知を送信しました。数秒以内にプッシュ通知が届くか確認してください。', type: 'success' });
      } else {
        throw new Error(res.error || '送信に失敗しました。');
      }
    } catch (err: any) {
      console.error(err);
      setPushMessage({ text: err.message || 'テスト通知の送信に失敗しました。サブスクリプションが登録されていない可能性があります。', type: 'error' });
    } finally {
      setPushLoading(false);
    }
  };

  // 登録されている全プッシュ購読をリセット
  const handleResetPush = async () => {
    if (!window.confirm('すべての登録デバイスのプッシュ通知設定をリセットしますか？\n（リセット後、通知を受け取る各デバイスで再度「通知を有効にする」を押す必要があります）')) {
      return;
    }
    
    setPushLoading(true);
    setPushMessage(null);

    try {
      // 1. ブラウザの購読オブジェクトを取得して解除（もし存在すれば）
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }
      
      // 2. バックエンドへリセット要求
      const res = await apiClient.post<{ success: boolean; error?: string }>('/api/push/unsubscribe-all', {});
      if (res.success) {
        setHasSubscription(false);
        setPushStatus(Notification.permission);
        setPushMessage({ text: '登録デバイスのプッシュ通知設定をすべてリセットしました。', type: 'success' });
      } else {
        throw new Error(res.error || 'リセットに失敗しました。');
      }
    } catch (err: any) {
      console.error(err);
      setPushMessage({ text: err.message || 'リセットに失敗しました。', type: 'error' });
    } finally {
      setPushLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post<{ success: boolean; fileUrl: string }>('/api/files/upload', formData);
      if (response.success && response.fileUrl) {
        setAvatarUrl(response.fileUrl);
        await triggerProfileUpdate(displayName, response.fileUrl, profileLang);
      }
    } catch (err: any) {
      alert(`${t('profile.updateFailed')} (Avatar): ${err.message || err}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // 共通プロフィール自動更新
  const triggerProfileUpdate = async (name: string, avatar: string | null, lang: string) => {
    try {
      await onUpdateProfile(name, avatar, lang);
      setGlobalLanguage(lang as 'ja' | 'en');
    } catch (err: any) {
      alert(`${t('profile.updateFailed')}: ${err.message || err}`);
    }
  };

  // メールアドレス変更リクエスト送信処理
  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailChangeMessage(null);
    setEmailChangeLoading(true);

    try {
      const res = await apiClient.post<{ success: boolean; emailUpdated: boolean; newEmail: string; error?: string }>(
        '/api/users/email-change-request',
        { newEmail, currentPassword: emailPassword }
      );

      if (res.success) {
        if (res.emailUpdated) {
          // SMTP未設定で即時変更された場合
          setEmailChangeMessage({ text: t('profile.emailChangeSuccessDirect'), type: 'success' });
          if (onUpdateEmail) {
            onUpdateEmail(res.newEmail);
          }
          setEmailPassword('');
          // 少し待ってからフォームを閉じる
          setTimeout(() => {
            setShowEmailChange(false);
            setEmailChangeMessage(null);
          }, 2000);
        } else {
          // SMTP設定済みで確認コードが送信された場合
          setEmailChangeStep('verify');
          setEmailChangeMessage({ text: t('profile.emailChangeSent'), type: 'success' });
        }
      } else {
        setEmailChangeMessage({ text: res.error || t('profile.updateFailed'), type: 'error' });
      }
    } catch (err: any) {
      setEmailChangeMessage({ text: err.message || t('profile.updateFailed'), type: 'error' });
    } finally {
      setEmailChangeLoading(false);
    }
  };

  // 確認コード確定処理
  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailChangeMessage(null);
    setEmailChangeLoading(true);

    try {
      const res = await apiClient.post<{ success: boolean; newEmail: string; error?: string }>(
        '/api/users/email-change-confirm',
        { code: verificationCode }
      );

      if (res.success) {
        setEmailChangeMessage({ text: t('profile.emailChangeSuccessDirect'), type: 'success' });
        if (onUpdateEmail) {
          onUpdateEmail(res.newEmail);
        }
        setVerificationCode('');
        setEmailPassword('');
        setTimeout(() => {
          setShowEmailChange(false);
          setEmailChangeStep('request');
          setEmailChangeMessage(null);
        }, 2000);
      } else {
        setEmailChangeMessage({ text: res.error || t('profile.updateFailed'), type: 'error' });
      }
    } catch (err: any) {
      setEmailChangeMessage({ text: err.message || t('profile.updateFailed'), type: 'error' });
    } finally {
      setEmailChangeLoading(false);
    }
  };

  // メールアドレス変更キャンセル処理
  const handleCancelEmailChange = () => {
    setShowEmailChange(false);
    setEmailChangeStep('request');
    setNewEmail('');
    setEmailPassword('');
    setVerificationCode('');
    setEmailChangeMessage(null);
  };

  // パスワード変更送信処理
  const handleChangePassword = async () => {
    setPasswordMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ text: t('profile.pwRequired'), type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: t('profile.pwMismatch'), type: 'error' });
      return;
    }

    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /\d/.test(newPassword);
    const hasNonalphas = /[^A-Za-z0-9]/.test(newPassword);

    if (newPassword.length < 8 || !(hasUpperCase && hasLowerCase && hasNumbers && hasNonalphas)) {
      setPasswordMessage({
        text: t('profile.pwFormatError'),
        type: 'error'
      });
      return;
    }

    try {
      const response = await apiClient.post<{ success: boolean; message?: string; error?: string }>('/api/auth/change-password', {
        currentPassword,
        newPassword
      });

      if (response.success) {
        setPasswordMessage({ text: t('profile.pwChangeSuccess'), type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMessage({ text: response.error || response.message || t('profile.pwChangeFailed'), type: 'error' });
      }
    } catch (err: any) {
      setPasswordMessage({ text: err.message || t('profile.pwChangeFailed'), type: 'error' });
    }
  };



  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" style={{ maxWidth: '450px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('profile.title')}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-body">
          <form onSubmit={(e) => e.preventDefault()} className="settings-form">
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <label style={{ margin: 0 }}>{t('profile.email')}</label>
                {!showEmailChange && (
                  <button
                    type="button"
                    onClick={() => setShowEmailChange(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-color, #3b82f6)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    {t('profile.changeEmail')}
                  </button>
                )}
              </div>
              <input type="text" value={currentUser.email} disabled className="form-input disabled" />
            </div>

            {showEmailChange && (
              <div className="email-change-section" style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '15px',
                marginBottom: '15px',
                animation: 'fadeIn 0.3s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-light, #f1f1f1)' }}>{t('profile.changeEmail')}</h4>
                  <button type="button" className="close-btn" onClick={handleCancelEmailChange} style={{ padding: '2px' }}>
                    <X size={16} />
                  </button>
                </div>
                
                {emailChangeMessage && (
                  <div className={`password-message ${emailChangeMessage.type}`} style={{ marginBottom: '10px', padding: '8px 12px', fontSize: '13px' }}>
                    {emailChangeMessage.text}
                  </div>
                )}

                {emailChangeStep === 'request' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', opacity: 0.8 }}>{t('profile.newEmail')}</label>
                      <input 
                        type="email" 
                        value={newEmail} 
                        onChange={(e) => setNewEmail(e.target.value)} 
                        required 
                        className="form-input" 
                        placeholder="new-email@example.com"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', opacity: 0.8 }}>{t('profile.currentPw')}</label>
                      <input 
                        type="password" 
                        value={emailPassword} 
                        onChange={(e) => setEmailPassword(e.target.value)} 
                        required 
                        className="form-input" 
                        placeholder="••••••••"
                      />
                    </div>
                    <p style={{ fontSize: '11px', opacity: 0.6, margin: '2px 0 5px' }}>
                      {t('profile.changeEmailHelp')}
                    </p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={handleCancelEmailChange}
                        disabled={emailChangeLoading}
                      >
                        {t('profile.cancelChange')}
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleRequestEmailChange}
                        disabled={emailChangeLoading || !newEmail || !emailPassword}
                      >
                        {emailChangeLoading ? <Loader className="animate-spin" size={14} /> : t('profile.requestChange')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', opacity: 0.8 }}>{t('profile.verificationCode')}</label>
                      <input 
                        type="text" 
                        value={verificationCode} 
                        onChange={(e) => setVerificationCode(e.target.value)} 
                        required 
                        className="form-input" 
                        placeholder="123456"
                        maxLength={6}
                        style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '18px', fontWeight: 'bold' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => {
                          setEmailChangeStep('request');
                          setEmailChangeMessage(null);
                        }}
                        disabled={emailChangeLoading}
                      >
                        {t('profile.cancelChange')}
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleConfirmEmailChange}
                        disabled={emailChangeLoading || verificationCode.length !== 6}
                      >
                        {emailChangeLoading ? <Loader className="animate-spin" size={14} /> : t('profile.confirmChange')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="form-group">
              <label>{t('profile.displayName')}</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)} 
                onBlur={() => {
                  if (displayName.trim() && displayName !== currentUser.displayName) {
                    triggerProfileUpdate(displayName, avatarUrl, profileLang);
                  }
                }}
                required 
                className="form-input" 
              />
            </div>
            <div className="form-group">
              <label>{t('profile.language')}</label>
              <select
                value={profileLang}
                onChange={(e) => {
                  const val = e.target.value;
                  setProfileLang(val);
                  triggerProfileUpdate(displayName, avatarUrl, val);
                }}
                className="form-input"
              >
                <option value="ja">日本語 (Japanese)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('sidebar.theme') === 'Theme' ? 'Theme' : 'テーマ'}</label>
              <select
                value={theme}
                onChange={(e) => {
                  const val = e.target.value as 'light' | 'dark';
                  setTheme(val);
                  localStorage.setItem('cohive_theme', val);
                  document.documentElement.classList.toggle('theme-light', val === 'light');
                }}
                className="form-input"
              >
                <option value="dark">{t('error') === 'Error' ? 'Dark' : 'ダーク'}</option>
                <option value="light">{t('error') === 'Error' ? 'Light' : 'ライト'}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('profile.avatar')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '5px' }}>
                <div className="user-avatar" style={{ width: '50px', height: '50px', fontSize: '20px', overflow: 'hidden' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl.startsWith('http') ? avatarUrl : `http://127.0.0.1:8787${avatarUrl}`} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    displayName.substring(0, 1).toUpperCase()
                  )}
                </div>
                <label className="upload-btn">
                  {uploadingAvatar ? <Loader className="animate-spin" size={16} /> : <Upload size={16} />}
                  <span>{uploadingAvatar ? t('profile.uploading') : t('profile.uploadImage')}</span>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} disabled={uploadingAvatar} />
                </label>
              </div>
            </div>

          {/* パスワード変更セクション */}
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--text-primary)' }}>
              {t('profile.pwChange')}
            </h3>
            
            {passwordMessage && (
              <div style={{
                padding: '8px 12px',
                background: passwordMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: passwordMessage.type === 'success' ? '#10b981' : '#ef4444',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '12px',
                border: passwordMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                {passwordMessage.text}
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>{t('profile.currentPw')}</label>
              <input 
                type="password" 
                value={currentPassword} 
                onChange={(e) => setCurrentPassword(e.target.value)} 
                className="form-input" 
                placeholder={t('profile.currentPw')}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label>{t('profile.newPw')}</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                className="form-input" 
                placeholder={t('profile.newPw')}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                {t('profile.newPwHelp')}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>{t('profile.confirmPw')}</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                className="form-input" 
                placeholder={t('profile.confirmPw')}
              />
            </div>
            <button 
              type="button" 
              onClick={handleChangePassword}
              className="submit-btn" 
              style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--border-light)' }}
            >
              {t('profile.pwChangeBtn')}
            </button>
          </div>

          {/* プッシュ通知設定セクション */}
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-light)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--text-primary)' }}>
              {t('error') === 'Error' ? 'Push Notification Settings' : 'プッシュ通知設定'}
            </h3>

            {pushMessage && (
              <div style={{
                padding: '8px 12px',
                background: pushMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: pushMessage.type === 'success' ? '#10b981' : '#ef4444',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '12px',
                border: pushMessage.type === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                {pushMessage.text}
              </div>
            )}

            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>{t('error') === 'Error' ? 'Browser Permission:' : 'ブラウザ通知権限:'}</span>
                <span style={{ fontWeight: 'bold', color: pushStatus === 'granted' ? '#10b981' : pushStatus === 'denied' ? '#ef4444' : '#f59e0b' }}>
                  {pushStatus === 'granted' ? '許可 (Granted)' : pushStatus === 'denied' ? 'ブロック (Denied)' : pushStatus === 'unsupported' ? '未対応 (Unsupported)' : 'デフォルト (Default)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('error') === 'Error' ? 'Push Subscription:' : 'プッシュ購読登録:'}</span>
                <span style={{ fontWeight: 'bold', color: hasSubscription ? '#10b981' : '#ef4444' }}>
                  {hasSubscription ? '登録済み (Registered)' : '未登録 (Not Registered)'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                onClick={handleEnablePush}
                disabled={pushLoading || pushStatus === 'unsupported'}
                className="submit-btn" 
                style={{ 
                  flex: 1, 
                  background: 'var(--accent-primary, #4f46e5)', 
                  color: '#fff', 
                  border: 'none',
                  fontSize: '12px',
                  padding: '8px 12px'
                }}
              >
                {pushLoading ? <Loader className="animate-spin" size={14} /> : (t('error') === 'Error' ? 'Enable Push' : '通知を有効にする')}
              </button>
              <button 
                type="button" 
                onClick={handleTestPush}
                disabled={pushLoading || !hasSubscription}
                className="submit-btn" 
                style={{ 
                  flex: 1, 
                  background: 'rgba(255,255,255,0.05)', 
                  color: '#fff', 
                  border: '1px solid var(--border-light)',
                  fontSize: '12px',
                  padding: '8px 12px'
                }}
              >
                {t('error') === 'Error' ? 'Send Test Push' : 'テスト通知を送信'}
              </button>
            </div>

            {hasSubscription && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleResetPush}
                  disabled={pushLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  {t('error') === 'Error' ? 'Reset All Devices Subscription' : '登録デバイスのリセット（すべて解除）'}
                </button>
              </div>
            )}
            {pushStatus === 'denied' && (
              <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', lineHeight: '1.4' }}>
                ※通知許可がブロックされています。ブラウザの設定から通知の許可を変更してください。
              </p>
            )}
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
              ※iOS/iPhone環境では、ホーム画面にPWAとして追加した状態で、上記の「通知を有効にする」ボタンをタップすることで、プッシュ通知の購読登録が行えます。
            </p>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

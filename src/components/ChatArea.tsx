import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message } from '../hooks/useChat';
import { Send, Smile, Paperclip, AlertCircle, RefreshCw, Trash2, HelpCircle, X, Loader, MessageSquare, CheckSquare, BookOpen, Menu, Image, Pin, Search, Plus, Upload, Maximize2, Minimize2 } from 'lucide-react';
import { apiClient } from '../utils/apiClient';
import { CreateItemModal } from './CreateItemModal';
import { DocumentPanel } from './DocumentPanel';
import { ItemsArea } from './ItemsArea';
import { MediaLibraryArea } from './MediaLibraryArea';
import { useLanguage } from '../utils/i18n';
import { parseMarkdownToHtml } from '../utils/markdown';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

export interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  description?: string;
  type?: string;
  groupId?: string | null;
  updatedAt?: string | null;
}

interface ChatAreaProps {
  channelName: string;
  channelDescription?: string;
  messages: Message[];
  currentUserId: string;
  channelMembers?: any[];
  workspaceMembers?: any[];
  workspaceId: string | null;
  activeChannelId: string | null;
  channels: Channel[];
  onSendMessage: (content: string, fileUrl?: string | null, fileName?: string | null, fileSize?: number | null) => Promise<void>;
  onRetryMessage: (messageId: string) => void;
  onDeleteFailedMessage: (messageId: string) => void;
  onSetReplyTarget: (message: Message | null) => void;
  replyTargetMessage: Message | null;
  onCancelReply: () => void;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onToggleLocalPin: (messageId: string, isPinned: boolean) => void;
  pollingInfo: {
    intervalTime: number;
    isActive: boolean;
    consecutiveEmptyCount: number;
  };
  onMenuClick?: () => void;
  currentUserRole?: 'owner' | 'group_admin' | 'member' | 'guest';
  workspace?: { id: string; name: string; custom_statuses?: string } | null;
  customEmojis?: any[];
  fetchCustomEmojis?: () => void;
  targetScrollMessageId?: string | null;
  clearTargetScrollMessageId?: () => void;
  onJumpToMessage?: (channelId: string, messageId: string) => void;
  onSearchClick?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  channelName,
  channelDescription,
  messages,
  currentUserId,
  channelMembers = [],
  workspaceMembers = [],
  workspaceId,
  activeChannelId,
  channels,
  onSendMessage,
  onRetryMessage,
  onDeleteFailedMessage,
  onSetReplyTarget,
  replyTargetMessage,
  onCancelReply,
  onToggleReaction,
  onToggleLocalPin,
  pollingInfo,
  onMenuClick,
  currentUserRole = 'member',
  workspace = null,
  customEmojis = [],
  fetchCustomEmojis,
  targetScrollMessageId,
  clearTargetScrollMessageId,
  onJumpToMessage,
  onSearchClick,
}) => {
  const { t } = useLanguage();
  const isEn = t('error') === 'Error';
  const [inputText, setInputText] = useState('');
  const isEmojiAdmin = currentUserRole === 'owner' || currentUserRole === 'group_admin';

  // メンション候補サジェスト用のState
  const [showMentionSuggest, setShowMentionSuggest] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // メンション候補の構築
  const mentionCandidates = React.useMemo(() => {
    const allCandidate = { userId: 'all', displayName: 'all', isAll: true, avatarUrl: null as string | null };
    const memberCandidates = workspaceMembers.map((m: any) => ({
      userId: m.userId,
      displayName: m.displayName || m.email.split('@')[0],
      avatarUrl: m.avatarUrl,
      isAll: false
    }));
    
    const list = [allCandidate, ...memberCandidates];
    if (!mentionQuery) return list;
    
    const query = mentionQuery.toLowerCase();
    return list.filter(item => item.displayName.toLowerCase().includes(query));
  }, [workspaceMembers, mentionQuery]);

  // サブヘッダーの左側ポータル用 DOM ノード
  const [docSubheaderLeftNode, setDocSubheaderLeftNode] = useState<HTMLDivElement | null>(null);
  const [tasksSubheaderLeftNode, setTasksSubheaderLeftNode] = useState<HTMLDivElement | null>(null);
  const [mediaSubheaderLeftNode, setMediaSubheaderLeftNode] = useState<HTMLDivElement | null>(null);

  // チャット入力用絵文字ピッカー用のステート
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [showInputEmojiUploadForm, setShowInputEmojiUploadForm] = useState(false);
  const [inputEmojiCode, setInputEmojiCode] = useState('');
  const [inputEmojiFile, setInputEmojiFile] = useState<File | null>(null);
  const [uploadingInputEmoji, setUploadingInputEmoji] = useState(false);
  const inputEmojiFileInputRef = useRef<HTMLInputElement | null>(null);

  // カスタム絵文字アップロードフォーム用のステート
  const [showEmojiUploadForm, setShowEmojiUploadForm] = useState(false);
  const [newEmojiCode, setNewEmojiCode] = useState('');
  const [newEmojiFile, setNewEmojiFile] = useState<File | null>(null);
  const [uploadingEmoji, setUploadingEmoji] = useState(false);
  const emojiFileInputRef = useRef<HTMLInputElement | null>(null);

  // 検索ヒット時の自動スクロール
  useEffect(() => {
    if (targetScrollMessageId && messages.length > 0) {
      const exists = messages.some(m => m.id === targetScrollMessageId);
      if (exists) {
        scrollToMessage(targetScrollMessageId);
        clearTargetScrollMessageId?.();
      }
    }
  }, [targetScrollMessageId, messages, clearTargetScrollMessageId]);

  // カスタム絵文字アップロード処理
  const handleUploadEmoji = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmojiFile || !newEmojiCode.trim() || !workspaceId) return;

    setUploadingEmoji(true);
    const formData = new FormData();
    formData.append('file', newEmojiFile);
    formData.append('code', newEmojiCode);

    try {
      const res = await apiClient.post<{ success: boolean; error?: string }>(
        `/api/workspaces/${workspaceId}/emojis`,
        formData
      );
      if (res.success) {
        setNewEmojiCode('');
        setNewEmojiFile(null);
        if (emojiFileInputRef.current) emojiFileInputRef.current.value = '';
        setShowEmojiUploadForm(false);
        fetchCustomEmojis?.();
        alert(isEn ? 'Emoji uploaded successfully!' : '絵文字のアップロードに成功しました！');
      } else {
        alert((isEn ? 'Failed to upload emoji: ' : '絵文字のアップロードに失敗しました: ') + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert((isEn ? 'Failed to upload emoji: ' : '絵文字のアップロードに失敗しました: ') + (err.message || err));
    } finally {
      setUploadingEmoji(false);
    }
  };

  // チャット入力ピッカー用カスタム絵文字アップロード処理
  const handleUploadInputEmoji = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!inputEmojiFile || !inputEmojiCode.trim() || !workspaceId) return;

    setUploadingInputEmoji(true);
    const formData = new FormData();
    formData.append('file', inputEmojiFile);
    formData.append('code', inputEmojiCode);

    try {
      const res = await apiClient.post<{ success: boolean; error?: string }>(
        `/api/workspaces/${workspaceId}/emojis`,
        formData
      );
      if (res.success) {
        setInputEmojiCode('');
        setInputEmojiFile(null);
        if (inputEmojiFileInputRef.current) inputEmojiFileInputRef.current.value = '';
        setShowInputEmojiUploadForm(false);
        fetchCustomEmojis?.();
        alert(isEn ? 'Emoji uploaded successfully!' : '絵文字のアップロードに成功しました！');
      } else {
        alert((isEn ? 'Failed to upload emoji: ' : '絵文字のアップロードに失敗しました: ') + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert((isEn ? 'Failed to upload emoji: ' : '絵文字のアップロードに失敗しました: ') + (err.message || err));
    } finally {
      setUploadingInputEmoji(false);
    }
  };

  // カスタム絵文字テキスト置換関数
  const replaceCustomEmojis = useCallback((htmlText: string) => {
    if (!htmlText || !customEmojis || customEmojis.length === 0) return htmlText;
    let result = htmlText;
    customEmojis.forEach((emoji) => {
      const escapedCode = emoji.code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedCode, 'g');
      result = result.replace(
        regex,
        `<img src="${emoji.url}" alt="${emoji.code}" title="${emoji.code}" class="custom-emoji-inline" style="height: 22px; width: 22px; object-fit: contain; vertical-align: middle; margin: 0 2px;" />`
      );
    });
    return result;
  }, [customEmojis]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // チャンネルドキュメント用ステートと処理
  const [showDoc, setShowDoc] = useState(false);
  const [docText, setDocText] = useState('');
  const [isDocFullScreen, setIsDocFullScreen] = useState(false);

  // タスク・メディアパネルトグルステート
  const [showTasks, setShowTasks] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [isTasksFullScreen, setIsTasksFullScreen] = useState(false);
  const [isMediaFullScreen, setIsMediaFullScreen] = useState(false);

  // ピン留め関連ステート
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);

  const fetchPinnedMessages = useCallback(async () => {
    if (!activeChannelId) return;
    setLoadingPins(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: any[] }>(
        `/api/channels/${activeChannelId}/pins`
      );
      if (res.success) {
        setPinnedMessages(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load pinned messages:', err);
    } finally {
      setLoadingPins(false);
    }
  }, [activeChannelId]);

  useEffect(() => {
    if (showPins && activeChannelId) {
      fetchPinnedMessages();
    }
  }, [activeChannelId, showPins, fetchPinnedMessages]);

  const handleTogglePin = async (messageId: string, isPinned: boolean) => {
    try {
      const action = isPinned ? 'unpin' : 'pin';
      const res = await apiClient.post<{ success: boolean }>(
        `/api/messages/${messageId}/${action}`
      );
      if (res.success) {
        // ローカルステートを即時更新 (楽観的UI)
        onToggleLocalPin(messageId, !isPinned);
        // ピン一覧を更新
        if (showPins) {
          fetchPinnedMessages();
        }
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const fetchDoc = async () => {
    if (!activeChannelId) return;
    try {
      const res = await apiClient.get<{ success: boolean; document: string }>(
        `/api/channels/${activeChannelId}/document`
      );
      if (res.success) {
        setDocText(res.document || '');
      }
    } catch (err) {
      console.error('Failed to fetch channel document:', err);
    }
  };

  useEffect(() => {
    if (showDoc && activeChannelId) {
      fetchDoc();
    }
  }, [activeChannelId, showDoc]);

  const handleToggleDoc = () => {
    if (!showDoc) {
      fetchDoc();
    }
    setShowDoc(!showDoc);
    setShowTasks(false);
    setShowMedia(false);
    setIsDocFullScreen(false);
  };

  const handleToggleTasks = () => {
    setShowTasks(!showTasks);
    setShowMedia(false);
    setShowDoc(false);
    setIsTasksFullScreen(false);
  };

  const handleToggleMedia = () => {
    setShowMedia(!showMedia);
    setShowTasks(false);
    setShowDoc(false);
    setIsMediaFullScreen(false);
  };

  // チャンネル切り替え時にすべてのトグルをリセット
  useEffect(() => {
    setShowTasks(false);
    setShowMedia(false);
    setShowDoc(false);
    setShowPins(false);
    setShowInputEmojiPicker(false);
    setIsTasksFullScreen(false);
    setIsMediaFullScreen(false);
  }, [activeChannelId]);

  // 新規メッセージ描画時にコードハイライトを適用
  useEffect(() => {
    if (messages.length > 0) {
      Prism.highlightAll();
    }
  }, [messages]);

  const saveChannelDoc = async (text: string) => {
    if (!activeChannelId) return;
    const res = await apiClient.put<{ success: boolean }>(
      `/api/channels/${activeChannelId}/document`,
      { document: text }
    );
    if (res.success) {
      setDocText(text);
    } else {
      throw new Error(isEn ? 'Failed to save' : '保存できませんでした');
    }
  };

  // アイテム連携用ステート
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemInitialData, setItemInitialData] = useState<any>(null);
  const [itemInitialType, setItemInitialType] = useState<'task' | 'event' | null>(null);

  const handleAddItemFromMessage = (msg: Message, type: 'task' | 'event') => {
    const currentChan = channels.find(c => c.id === activeChannelId);
    const isChanPrivate = currentChan ? (currentChan.isPrivate || currentChan.type === 'dm') : true;

    if (type === 'task') {
      setItemInitialData({
        title: msg.content.substring(0, 30),
        description: `【チャットメッセージより登録】\n送信者: ${msg.user.displayName}\n本文:\n${msg.content}`,
        assigneeId: null,
        status: 'todo',
        startAt: null,
        endAt: null,
        isAllDay: false,
        isPrivate: isChanPrivate,
        channelId: activeChannelId,
      });
    } else {
      const start = new Date();
      start.setMinutes(0);
      start.setSeconds(0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);

      setItemInitialData({
        title: msg.content.substring(0, 30),
        description: `【チャットメッセージより登録】\n送信者: ${msg.user.displayName}\n本文:\n${msg.content}`,
        assigneeId: null,
        status: 'todo',
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        isAllDay: false,
        isPrivate: isChanPrivate,
        channelId: activeChannelId,
      });
    }
    setItemInitialType(type);
    setIsItemModalOpen(true);
  };

  const handleSaveItemFromChat = async (itemData: any) => {
    if (!workspaceId) return;
    await apiClient.post(`/api/workspaces/${workspaceId}/items`, itemData);
    alert(isEn ? 'Item registered successfully' : 'アイテムを登録しました');
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('reply-highlight');
      setTimeout(() => {
        element.classList.remove('reply-highlight');
      }, 2000);
    }
  };

  // ファイル添付関連のステート
  const [attachedFile, setAttachedFile] = useState<{
    url: string;
    name: string;
    size: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // リアクション絵文字パレットの表示管理（メッセージIDを保持）
  const [showEmojiPaletteMsgId, setShowEmojiPaletteMsgId] = useState<string | null>(null);

  // メンバー一覧ポップオーバーの表示管理
  const [showMembersPopover, setShowMembersPopover] = useState(false);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

  // メッセージ追加時に自動最下部スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // チャンネル切り替え時にメンバーポップオーバーを閉じる
  useEffect(() => {
    setShowMembersPopover(false);
  }, [channelName]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachedFile) return;
    const textToSend = inputText;
    const fileToSend = attachedFile;

    setInputText(''); // 送信後入力欄を即クリア
    setAttachedFile(null); // 添付ファイルもクリア
    setShowMentionSuggest(false); // メンション候補を非表示
    setMentionTriggerIndex(-1);

    await onSendMessage(
      textToSend,
      fileToSend?.url || null,
      fileToSend?.name || null,
      fileToSend?.size || null
    );
  };

  const insertMention = useCallback((candidate: any) => {
    if (mentionTriggerIndex === -1 || !textareaRef.current) return;
    
    const value = inputText;
    const beforeMention = value.substring(0, mentionTriggerIndex);
    const afterMention = value.substring(textareaRef.current.selectionStart);
    const mentionText = `@${candidate.displayName} `;
    
    const newValue = beforeMention + mentionText + afterMention;
    setInputText(newValue);
    setShowMentionSuggest(false);
    setMentionTriggerIndex(-1);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  }, [inputText, mentionTriggerIndex]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    const selectionStart = e.target.selectionStart;
    const textBeforeCaret = value.substring(0, selectionStart);
    
    const lastAtIndex = textBeforeCaret.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCaret.substring(lastAtIndex + 1);
      const isValidTrigger = lastAtIndex === 0 || /\s/.test(textBeforeCaret[lastAtIndex - 1]);
      const hasSpaceAfterAt = /\s/.test(textAfterAt);
      
      if (isValidTrigger && !hasSpaceAfterAt) {
        setShowMentionSuggest(true);
        setMentionQuery(textAfterAt);
        setMentionTriggerIndex(lastAtIndex);
        setMentionIndex(0);
        return;
      }
    }
    
    setShowMentionSuggest(false);
    setMentionTriggerIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionSuggest && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionSuggest(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  // ファイル添付ボタンクリック時の処理
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // ファイル選択後のアップロード処理
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiClient.post<{
        success: boolean;
        fileUrl: string;
        objectKey: string;
      }>('/api/files/upload', formData);

      if (response.success && response.fileUrl) {
        setAttachedFile({
          url: response.fileUrl,
          name: file.name,
          size: file.size,
        });
      }
    } catch (err: any) {
      alert((isEn ? 'Failed to upload file: ' : 'ファイルのアップロードに失敗しました: ') + (err.message || err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // タイムスタンプのフォーマット
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const isImageFile = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', minWidth: 0 }}>
      <div className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        {/* 1. ヘッダー */}
        <div className="chat-header">
          {onMenuClick && (
            <button className="mobile-menu-trigger" onClick={onMenuClick} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: '4px', display: 'flex', alignItems: 'center', marginRight: '8px' }}>
              <Menu size={20} />
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <h1 className="channel-info-title">#{channelName}</h1>
            {channelDescription && <p className="channel-info-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelDescription}</p>}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {/* ドキュメントトグル */}
            <button
              type="button"
              className={`input-icon-btn ${showDoc ? 'active' : ''}`}
              onClick={handleToggleDoc}
              title={isEn ? 'Channel Document' : 'チャンネルドキュメント'}
              style={{
                background: showDoc ? 'var(--bg-active)' : 'transparent',
                color: showDoc ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <BookOpen size={18} />
            </button>

            {/* タスク一覧トグル */}
            <button
              type="button"
              className={`input-icon-btn ${showTasks ? 'active' : ''}`}
              onClick={handleToggleTasks}
              title={isEn ? 'Channel Tasks' : 'チャネルタスク一覧'}
              style={{
                background: showTasks ? 'var(--bg-active)' : 'transparent',
                color: showTasks ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CheckSquare size={18} />
            </button>

            {/* メディア一覧トグル */}
            <button
              type="button"
              className={`input-icon-btn ${showMedia ? 'active' : ''}`}
              onClick={handleToggleMedia}
              title={isEn ? 'Channel Media' : 'チャネルメディア一覧'}
              style={{
                background: showMedia ? 'var(--bg-active)' : 'transparent',
                color: showMedia ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Image size={18} />
            </button>
          </div>
        </div>

        {/* チャンネルドキュメント */}
        {showDoc && (
          <div 
            style={
              isDocFullScreen 
                ? { position: 'absolute', top: '64px', left: 0, right: 0, bottom: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', height: 'calc(100% - 64px)', width: '100%' }
                : { height: '350px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', flexShrink: 0, position: 'relative', zIndex: 10 }
            }
          >
            {/* サブヘッダー領域（アクションボタンとポータル先） */}
            <div 
              className="chat-subheader"
              style={{
                height: '48px',
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-secondary, rgba(24, 28, 37, 0.5))',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexShrink: 0,
                zIndex: 10,
              }}
            >
              {/* 左側：各コンテンツ用のポータル受け皿 */}
              <div ref={setDocSubheaderLeftNode} style={{ display: 'flex', alignItems: 'center', height: '100%' }} />

              {/* 右側：全画面・閉じるボタン */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsDocFullScreen(!isDocFullScreen)}
                  title={isDocFullScreen ? (t('error') === 'Error' ? 'Exit fullscreen' : '通常表示に戻す') : (t('error') === 'Error' ? 'Enter fullscreen' : '全画面表示にする')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {isDocFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                
                <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 2px' }} />
                
                <button
                  onClick={() => {
                    setShowDoc(false);
                    setIsDocFullScreen(false);
                  }}
                  title={isEn ? 'Close' : '閉じる'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
              <DocumentPanel
                title={isEn ? `${channelName}'s Document` : `${channelName} のドキュメント`}
                initialValue={docText}
                onSave={saveChannelDoc}
                onClose={() => {
                  setShowDoc(false);
                  setIsDocFullScreen(false);
                }}
                onToggleFullScreen={() => setIsDocFullScreen(!isDocFullScreen)}
                isFullScreen={isDocFullScreen}
                type="chat"
                lockKey={`channel:${activeChannelId}`}
                subheaderLeftPortalNode={docSubheaderLeftNode}
              />
            </div>
          </div>
        )}

        {/* チャンネルタスク */}
        {showTasks && (
          <div 
            style={
              isTasksFullScreen 
                ? { position: 'absolute', top: '64px', left: 0, right: 0, bottom: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', height: 'calc(100% - 64px)', width: '100%' }
                : { height: '350px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', flexShrink: 0, position: 'relative', zIndex: 10 }
            }
          >
            {/* サブヘッダー領域（アクションボタンとポータル先） */}
            <div 
              className="chat-subheader"
              style={{
                height: '48px',
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-secondary, rgba(24, 28, 37, 0.5))',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexShrink: 0,
                zIndex: 10,
              }}
            >
              {/* 左側：各コンテンツ用のポータル受け皿 */}
              <div ref={setTasksSubheaderLeftNode} style={{ display: 'flex', alignItems: 'center', height: '100%' }} />

              {/* 右側：全画面・閉じるボタン */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsTasksFullScreen(!isTasksFullScreen)}
                  title={isTasksFullScreen ? (t('error') === 'Error' ? 'Exit fullscreen' : '通常表示に戻す') : (t('error') === 'Error' ? 'Enter fullscreen' : '全画面表示にする')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {isTasksFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                
                <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 2px' }} />
                
                <button
                  onClick={() => {
                    setShowTasks(false);
                    setIsTasksFullScreen(false);
                  }}
                  title={isEn ? 'Close' : '閉じる'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
              <ItemsArea
                workspaceId={workspaceId}
                workspace={workspace}
                activeChannelId={activeChannelId}
                channels={channels}
                workspaceMembers={workspaceMembers || []}
                currentUserId={currentUserId}
                isChatMode={true}
                onClose={() => {
                  setShowTasks(false);
                  setIsTasksFullScreen(false);
                }}
                onToggleFullScreen={() => setIsTasksFullScreen(!isTasksFullScreen)}
                isFullScreen={isTasksFullScreen}
                subheaderLeftPortalNode={tasksSubheaderLeftNode}
              />
            </div>
          </div>
        )}

        {/* チャンネルメディア */}
        {showMedia && (
          <div 
            style={
              isMediaFullScreen 
                ? { position: 'absolute', top: '64px', left: 0, right: 0, bottom: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', height: 'calc(100% - 64px)', width: '100%' }
                : { height: '350px', borderBottom: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', flexShrink: 0, position: 'relative', zIndex: 10 }
            }
          >
            {/* サブヘッダー領域（アクションボタンとポータル先） */}
            <div 
              className="chat-subheader"
              style={{
                height: '48px',
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-secondary, rgba(24, 28, 37, 0.5))',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexShrink: 0,
                zIndex: 10,
              }}
            >
              {/* 左側：各コンテンツ用のポータル受け皿 */}
              <div ref={setMediaSubheaderLeftNode} style={{ display: 'flex', alignItems: 'center', height: '100%' }} />

              {/* 右側：全画面・閉じるボタン */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsMediaFullScreen(!isMediaFullScreen)}
                  title={isMediaFullScreen ? (t('error') === 'Error' ? 'Exit fullscreen' : '通常表示に戻す') : (t('error') === 'Error' ? 'Enter fullscreen' : '全画面表示にする')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {isMediaFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                
                <div style={{ width: '1px', height: '16px', background: 'var(--border-light)', margin: '0 2px' }} />
                
                <button
                  onClick={() => {
                    setShowMedia(false);
                    setIsMediaFullScreen(false);
                  }}
                  title={isEn ? 'Close' : '閉じる'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    padding: '6px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-active, rgba(255, 255, 255, 0.05))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
              <MediaLibraryArea
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                channels={channels}
                isChatMode={true}
                onClose={() => {
                  setShowMedia(false);
                  setIsMediaFullScreen(false);
                }}
                onToggleFullScreen={() => setIsMediaFullScreen(!isMediaFullScreen)}
                isFullScreen={isMediaFullScreen}
                activeChannelId={activeChannelId}
                subheaderLeftPortalNode={mediaSubheaderLeftNode}
              />
            </div>
          </div>
        )}

        {/* メインチャット表示エリア（ドキュメント/タスク/メディアが全画面表示のときは非表示に） */}
        {!(showDoc && isDocFullScreen) && !(showTasks && isTasksFullScreen) && !(showMedia && isMediaFullScreen) && (
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* サブヘッダー専用領域 */}
            <div 
              className="chat-subheader"
              style={{
                height: '48px',
                borderBottom: '1px solid var(--border-light)',
                background: 'var(--bg-secondary, rgba(24, 28, 37, 0.5))',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                zIndex: 10,
                position: 'relative'
              }}
            >
              {/* 参加中メンバーの顔ぶれ */}
              {channelMembers && channelMembers.length > 0 && (
                <div 
                  className="channel-members-trigger chat-floating-btn"
                  onClick={() => {
                    const nextShow = !showMembersPopover;
                    setShowMembersPopover(nextShow);
                    if (nextShow) {
                      setShowPins(false);
                    }
                  }}
                  title={isEn ? 'Show members' : 'メンバー一覧を表示'}
                >
                  <div className="avatar-group">
                    {channelMembers.slice(0, 3).map((member, idx) => (
                      <div 
                        key={member.userId} 
                        className="avatar-group-item"
                        style={{ zIndex: 3 - idx }}
                      >
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.displayName} />
                        ) : (
                          member.displayName.substring(0, 1).toUpperCase()
                        )}
                      </div>
                    ))}
                    {channelMembers.length > 3 && (
                      <div className="avatar-group-item-more">
                        +{channelMembers.length - 3}
                      </div>
                    )}
                  </div>
                  <span className="channel-members-count-text">
                    {isEn ? (channelMembers.length === 1 ? '1 member' : `${channelMembers.length} members`) : `${channelMembers.length} 人のメンバー`}
                  </span>
                </div>
              )}

              {/* ピン留めメッセージトグル */}
              <div
                className={`channel-pins-trigger chat-floating-btn ${showPins ? 'active' : ''}`}
                onClick={() => {
                  const nextShowPins = !showPins;
                  setShowPins(nextShowPins);
                  if (nextShowPins) {
                    setShowMembersPopover(false);
                  }
                }}
                title={isEn ? 'Pinned Messages' : 'ピン留めされたメッセージ'}
              >
                <Pin size={14} fill={showPins ? "var(--accent-warning, #f59e0b)" : "none"} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {isEn ? 'Pins' : 'ピン留め'}
                </span>
              </div>
            </div>

            {/* メンバー一覧ポップオーバー（サブヘッダー下・左揃え） */}
            {showMembersPopover && channelMembers && channelMembers.length > 0 && (
              <div 
                className="members-popover"
                style={{
                  position: 'absolute',
                  top: '48px',
                  left: '24px',
                  zIndex: 100,
                }}
              >
                <div className="members-popover-header">
                  <span className="members-popover-title">{isEn ? `Members (${channelMembers.length})` : `メンバー (${channelMembers.length})`}</span>
                  <button 
                    className="members-popover-close"
                    onClick={() => setShowMembersPopover(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="members-popover-list">
                  {channelMembers.map((member) => (
                    <div key={member.userId} className="members-popover-item">
                      <div className="member-popover-avatar">
                        {member.avatarUrl ? (
                          <img src={member.avatarUrl} alt={member.displayName} />
                        ) : (
                          member.displayName.substring(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="member-popover-info">
                        <span className="member-popover-name">{member.displayName}</span>
                        <span className="member-popover-email">{member.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ピン留めメッセージポップオーバー（サブヘッダー下・左揃え） */}
            {showPins && (
              <div 
                className="pinned-popover"
                style={{
                  position: 'absolute',
                  top: '48px',
                  left: '24px',
                  zIndex: 100,
                }}
              >
                <div className="pinned-popover-header">
                  <div className="pinned-popover-title">
                    <Pin size={16} fill="var(--accent-warning, #f59e0b)" color="var(--accent-warning, #f59e0b)" />
                    <span>{isEn ? 'Pinned Messages' : 'ピン留めされたメッセージ'}</span>
                  </div>
                  <button 
                    onClick={() => setShowPins(false)}
                    className="members-popover-close"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <div className="pinned-popover-list">
                  {loadingPins ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                      <Loader className="spin animate-spin" size={20} />
                    </div>
                  ) : pinnedMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px', fontSize: '13px' }}>
                      {isEn ? 'No pinned messages in this channel.' : 'ピン留めされたメッセージはありません。'}
                    </div>
                  ) : (
                    pinnedMessages.map((pin) => (
                      <div 
                        key={pin.id} 
                        className="pinned-message-item"
                        style={{ 
                          padding: '10px', 
                          background: 'var(--bg-main)', 
                          border: '1px solid var(--border-light)', 
                          borderRadius: '8px',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{pin.user?.displayName || 'User'}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formatTime(pin.createdAt)}</span>
                        </div>
                        
                        <div 
                          style={{ fontSize: '12px', wordBreak: 'break-all', color: 'var(--text-primary)', lineHeight: 1.4 }}
                          dangerouslySetInnerHTML={{ __html: replaceCustomEmojis(parseMarkdownToHtml(pin.content)) }}
                        />

                        {/* 添付ファイルの簡易表示 */}
                        {pin.fileUrl && (
                          <div style={{ marginTop: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Paperclip size={10} />
                            <a href={pin.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                              {pin.fileName || 'Attachment'}
                            </a>
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '9px', color: 'var(--text-muted)' }}>
                          <span>{isEn ? `Pinned by ${pin.pinnedBy}` : `${pin.pinnedBy} がピン`}</span>
                          <button 
                            onClick={() => handleTogglePin(pin.id, true)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-danger, #ef4444)', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                          >
                            {isEn ? 'Unpin' : '解除'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 2. メッセージ表示エリア */}
            <div className="messages-viewport">
              {messages.length === 0 ? (
                <div className="no-message-selected">
                  <HelpCircle size={48} strokeWidth={1} />
                  <p>{isEn ? 'No messages yet. Start the conversation!' : 'まだメッセージはありません。会話を始めましょう！'}</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSelf = msg.userId === currentUserId;
                  return (
                    <div key={msg.id} id={`message-${msg.id}`} className={`message-card ${isSelf ? 'self' : ''} ${msg.isPinned ? 'pinned' : ''}`}>
                      <div className="message-avatar">
                        {msg.user.displayName.substring(0, 1).toUpperCase()}
                      </div>
                      <div className="message-content-wrapper">
                        <div className="message-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="message-sender">{msg.user.displayName}</span>
                          <span className="message-time">{formatTime(msg.createdAt)}</span>
                          {msg.isPinned && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--accent-warning, #f59e0b)', fontWeight: 'bold' }}>
                              <Pin size={10} fill="var(--accent-warning, #f59e0b)" />
                              {isEn ? 'Pinned' : 'ピン留め済'}
                            </span>
                          )}
                        </div>

                        {/* 引用返信（リプライ）の表示 */}
                        {msg.parentMessage && (
                          <div 
                            className="reply-quote-preview" 
                            onClick={() => scrollToMessage(msg.parentId!)}
                            title={isEn ? 'Click to jump to the quoted message' : 'クリックして引用元メッセージに移動'}
                          >
                            <span className="reply-quote-sender">@{msg.parentMessage.userDisplayName}</span>
                            <span className="reply-quote-content" dangerouslySetInnerHTML={{ __html: replaceCustomEmojis(parseMarkdownToHtml(msg.parentMessage.content)) }}></span>
                          </div>
                        )}
                        
                        {/* メッセージ本文の吹き出し */}
                        {msg.content && (
                          <div 
                            className={`message-bubble ${msg.status === 'sending' ? 'pending' : ''} markdown-body`}
                            dangerouslySetInnerHTML={{ __html: replaceCustomEmojis(parseMarkdownToHtml(msg.content)) }}
                          />
                        )}

                        {/* 添付ファイルの表示 */}
                        {msg.fileUrl && (
                          <div className="message-attachment" style={{ marginTop: '6px' }}>
                            {isImageFile(msg.fileName || '') ? (
                              <div className="attachment-image-preview">
                                <img 
                                  src={msg.fileUrl.startsWith('http') ? msg.fileUrl : `http://127.0.0.1:8787${msg.fileUrl}`} 
                                  alt={msg.fileName || 'Attachment'} 
                                  style={{ maxWidth: '300px', maxHeight: '200px', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}
                                  onClick={() => window.open(msg.fileUrl!.startsWith('http') ? msg.fileUrl! : `http://127.0.0.1:8787${msg.fileUrl}`, '_blank')}
                                />
                              </div>
                            ) : (
                              <a 
                                href={msg.fileUrl.startsWith('http') ? msg.fileUrl : `http://127.0.0.1:8787${msg.fileUrl}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="attachment-file-link"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '6px', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
                              >
                                <Paperclip size={16} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 500 }}>{msg.fileName}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatFileSize(msg.fileSize || 0)}</span>
                                </div>
                              </a>
                            )}
                          </div>
                        )}

                        {/* ステータスインジケーター（楽観的UI） */}
                        {msg.status === 'sending' && (
                          <div className="status-indicator pending">
                            <span>{isEn ? 'Sending...' : '送信中...'}</span>
                          </div>
                        )}

                        {msg.status === 'failed' && (
                          <div className="status-indicator failed">
                            <AlertCircle size={12} />
                            <span>{isEn ? 'Failed to send' : '送信に失敗しました'}</span>
                            <button 
                              className="retry-action-btn"
                              onClick={() => onRetryMessage(msg.id)}
                            >
                              {isEn ? 'Retry' : '再試行'}
                            </button>
                            <button 
                              className="delete-action-btn"
                              onClick={() => onDeleteFailedMessage(msg.id)}
                            >
                              {isEn ? 'Delete' : '削除'}
                            </button>
                          </div>
                        )}

                        {/* リアクション一覧のバッジ表示 */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className="reactions-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                            {Object.entries(
                              msg.reactions.reduce((acc, r) => {
                                if (!acc[r.emoji]) acc[r.emoji] = [];
                                acc[r.emoji].push(r.userId);
                                return acc;
                              }, {} as Record<string, string[]>)
                            ).map(([emoji, userIds]) => {
                              const hasReacted = userIds.includes(currentUserId);
                              return (
                                <button
                                  key={emoji}
                                  className={`reaction-badge ${hasReacted ? 'active' : ''}`}
                                  onClick={() => !isSelf && onToggleReaction(msg.id, emoji)}
                                  style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    padding: '2px 8px', 
                                    background: hasReacted ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-panel)', 
                                    border: '1px solid', 
                                    borderColor: hasReacted ? 'rgba(14, 165, 233, 0.4)' : 'var(--border-light)', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    cursor: isSelf ? 'default' : 'pointer', 
                                    color: hasReacted ? 'var(--accent-primary)' : 'var(--text-primary)',
                                    transition: 'all 0.1s ease',
                                    opacity: isSelf ? 0.8 : 1
                                  }}
                                  title={isSelf 
                                    ? (isEn ? `${userIds.length} user(s) reacted (You cannot react to your own message)` : `${userIds.length}人がリアクションしました（自分のメッセージにはリアクションできません）`) 
                                    : (isEn ? `${userIds.length} user(s) reacted` : `${userIds.length}人がリアクションしました`)}
                                  disabled={isSelf}
                                >
                                  {(() => {
                                    const isCustom = emoji.startsWith(':') && emoji.endsWith(':');
                                    if (isCustom && customEmojis) {
                                      const matched = customEmojis.find(e => e.code === emoji);
                                      if (matched) {
                                        return <img src={matched.url} alt={emoji} style={{ height: '16px', width: '16px', objectFit: 'contain' }} />;
                                      }
                                    }
                                    return <span>{emoji}</span>;
                                  })()}
                                  <span style={{ fontWeight: 600 }}>{userIds.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* メッセージアクション */}
                        {msg.status === 'sent' && (
                          <div className="message-actions" style={{ display: 'flex', gap: '6px', position: 'relative' }}>
                            <button 
                              className="message-actions-btn"
                              onClick={() => onSetReplyTarget(msg)}
                            >
                              {isEn ? 'Reply' : '返信する'}
                            </button>
                            <button 
                              className="message-actions-btn"
                              onClick={() => handleAddItemFromMessage(msg, 'task')}
                              title={isEn ? 'Register this message to task/schedule' : 'このメッセージをタスク・予定に登録'}
                            >
                              {isEn ? 'Add Task/Event' : 'タスク・予定追加'}
                            </button>
                            <button 
                              className={`message-actions-btn ${msg.isPinned ? 'pinned' : ''}`}
                              onClick={() => handleTogglePin(msg.id, !!msg.isPinned)}
                              title={msg.isPinned ? (isEn ? 'Unpin message' : 'ピン留めを解除') : (isEn ? 'Pin message' : 'ピン留めする')}
                              style={{ color: msg.isPinned ? 'var(--accent-warning, #f59e0b)' : 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Pin size={14} fill={msg.isPinned ? 'var(--accent-warning, #f59e0b)' : 'none'} />
                            </button>

                            {!isSelf && (
                              <button 
                                className="message-actions-btn"
                                onClick={() => setShowEmojiPaletteMsgId(showEmojiPaletteMsgId === msg.id ? null : msg.id)}
                                title={isEn ? 'Reaction' : 'リアクション'}
                              >
                                <Smile size={14} />
                              </button>
                            )}

                            {showEmojiPaletteMsgId === msg.id && (
                              <div 
                                className="emoji-palette" 
                                style={{ 
                                  position: 'absolute', 
                                  bottom: '100%', 
                                  left: 0, 
                                  zIndex: 10, 
                                  display: 'flex', 
                                  gap: '4px', 
                                  padding: '6px', 
                                  background: 'var(--bg-panel)', 
                                  border: '1px solid var(--border-light)', 
                                  borderRadius: '20px', 
                                  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)' 
                                }}
                              >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {commonEmojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className="emoji-btn"
                                      onClick={async () => {
                                        await onToggleReaction(msg.id, emoji);
                                        setShowEmojiPaletteMsgId(null);
                                      }}
                                      style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '4px', transition: 'transform 0.1s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>

                                {/* カスタム絵文字エリア */}
                                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{isEn ? 'Custom Emojis' : 'カスタム絵文字'}</span>
                                    {isEmojiAdmin && (
                                      <button 
                                        type="button"
                                        onClick={() => setShowEmojiUploadForm(!showEmojiUploadForm)}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', padding: 0 }}
                                      >
                                        <Plus size={10} />
                                        {isEn ? 'Add' : '追加'}
                                      </button>
                                    )}
                                  </div>

                                  {showEmojiUploadForm ? (
                                    <form onSubmit={handleUploadEmoji} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-main)', padding: '6px', borderRadius: '4px' }}>
                                      <input 
                                        type="text" 
                                        placeholder=":code:" 
                                        value={newEmojiCode} 
                                        onChange={(e) => setNewEmojiCode(e.target.value)}
                                        style={{ fontSize: '11px', padding: '2px 4px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '3px', color: 'var(--text-primary)' }}
                                        required
                                      />
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <button 
                                          type="button" 
                                          onClick={() => emojiFileInputRef.current?.click()}
                                          style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-active)', border: 'none', borderRadius: '3px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                        >
                                          <Upload size={10} />
                                          {newEmojiFile ? newEmojiFile.name.substring(0, 10) : (isEn ? 'Choose' : '選択')}
                                        </button>
                                        <input 
                                          type="file" 
                                          ref={emojiFileInputRef} 
                                          onChange={(e) => setNewEmojiFile(e.target.files?.[0] || null)}
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                        />
                                        <button 
                                          type="submit" 
                                          disabled={uploadingEmoji}
                                          style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--accent-primary)', border: 'none', borderRadius: '3px', color: '#fff', cursor: 'pointer', marginLeft: 'auto' }}
                                        >
                                          {uploadingEmoji ? (isEn ? 'Uploading...' : '中...') : (isEn ? 'Save' : '保存')}
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '100px', overflowY: 'auto', padding: '2px' }}>
                                      {customEmojis.length === 0 ? (
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{isEn ? 'No custom emojis' : 'なし'}</span>
                                      ) : (
                                        customEmojis.map((emoji) => (
                                          <button
                                            key={emoji.id}
                                            type="button"
                                            onClick={async () => {
                                              await onToggleReaction(msg.id, emoji.code);
                                              setShowEmojiPaletteMsgId(null);
                                            }}
                                            title={emoji.code}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          >
                                            <img src={emoji.url} alt={emoji.code} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 添付ファイルのプレビュー（送信前） */}
            {uploading && (
              <div style={{ padding: '0 16px 8px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <Loader className="animate-spin" size={14} />
                <span>{isEn ? 'Uploading file...' : 'ファイルをアップロード中...'}</span>
              </div>
            )}

            {attachedFile && (
              <div style={{ margin: '0 16px 8px 16px', padding: '8px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <Paperclip size={16} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{attachedFile.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({formatFileSize(attachedFile.size)})</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setAttachedFile(null)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* ポーリング監視モニター（メッセージエリアと入力欄の間に配置） */}
            <div className={`polling-badge ${pollingInfo.isActive ? 'active' : ''}`}>
              <span>
                {pollingInfo.isActive 
                  ? `Syncing (${pollingInfo.intervalTime / 1000}s)` 
                  : 'Paused'}
              </span>
              {pollingInfo.isActive && pollingInfo.consecutiveEmptyCount > 0 && (
                <span style={{ opacity: 0.7, fontSize: '10px' }}>
                  (No news x{pollingInfo.consecutiveEmptyCount})
                </span>
              )}
            </div>

            {/* 3. 送信フォーム */}
            <div className="chat-input-container" style={{ position: 'relative' }}>
              {showMentionSuggest && mentionCandidates.length > 0 && (
                <div 
                  className="mention-suggest-popover"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '12px',
                    right: '12px',
                    zIndex: 200,
                    background: 'var(--bg-panel, #1f2937)',
                    border: '1px solid var(--border-light, #374151)',
                    borderRadius: '8px',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.15)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginBottom: '8px',
                    padding: '4px 0'
                  }}
                >
                  {mentionCandidates.map((candidate, idx) => {
                    const isActive = idx === mentionIndex;
                    return (
                      <div
                        key={candidate.userId}
                        onClick={() => insertMention(candidate)}
                        onMouseEnter={() => setMentionIndex(idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          background: isActive ? 'var(--accent-primary, #4f46e5)' : 'transparent',
                          color: isActive ? '#ffffff' : 'var(--text-primary, #f3f4f6)',
                          transition: 'background 0.15s, color 0.15s',
                          fontSize: '13px'
                        }}
                      >
                        {candidate.isAll ? (
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--border-light, #374151)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '11px'
                          }}>
                            ALL
                          </div>
                        ) : (
                          candidate.avatarUrl ? (
                            <img 
                              src={candidate.avatarUrl} 
                              alt={candidate.displayName}
                              style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--border-light, #374151)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '11px',
                              textTransform: 'uppercase'
                            }}>
                              {candidate.displayName[0]}
                            </div>
                          )
                        )}
                        <span style={{ fontWeight: 500 }}>
                          {candidate.isAll ? 'all (全員宛て)' : candidate.displayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 返信先のプレビュー表示 */}
              {replyTargetMessage && (
                <div className="chat-input-reply-preview">
                  <div className="reply-preview-info">
                    <span className="reply-preview-label">{isEn ? `Replying to @${replyTargetMessage.user.displayName}` : `@${replyTargetMessage.user.displayName} への返信`}</span>
                    <span className="reply-preview-text">{replyTargetMessage.content}</span>
                  </div>
                  <button 
                    type="button" 
                    className="reply-preview-cancel-btn"
                    onClick={onCancelReply} 
                    title={isEn ? 'Cancel reply' : '返信をキャンセル'}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <form onSubmit={handleSend} className={`chat-input-wrapper ${replyTargetMessage ? 'has-reply-preview' : ''}`}>
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder={isEn ? `Message #${channelName}` : `#${channelName} へのメッセージ`}
                  value={inputText}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                />
                <div className="chat-input-actions">
                  <div className="input-action-buttons" style={{ position: 'relative' }}>
                    <button 
                      type="button" 
                      className="input-icon-btn" 
                      title={isEn ? 'Attach file' : 'ファイルを添付'}
                      onClick={triggerFileSelect}
                    >
                      <Paperclip size={18} />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      style={{ display: 'none' }} 
                    />

                    <button 
                      type="button" 
                      className={`input-icon-btn ${showInputEmojiPicker ? 'active' : ''}`}
                      title={isEn ? 'Insert Emoji' : '絵文字を挿入'}
                      onClick={() => setShowInputEmojiPicker(!showInputEmojiPicker)}
                    >
                      <Smile size={18} />
                    </button>

                    {showInputEmojiPicker && (
                      <div 
                        className="input-emoji-picker-popover"
                        style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '10px',
                          zIndex: 100,
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          padding: '10px',
                          width: '260px',
                          marginBottom: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {commonEmojis.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setInputText(prev => prev + emoji);
                                setShowInputEmojiPicker(false);
                              }}
                              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{isEn ? 'Custom Emojis' : 'カスタム絵文字'}</span>
                            {isEmojiAdmin && (
                              <button 
                                type="button"
                                onClick={() => setShowInputEmojiUploadForm(!showInputEmojiUploadForm)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', padding: 0 }}
                              >
                                <Plus size={10} />
                                {isEn ? 'Add' : '追加'}
                              </button>
                            )}
                          </div>

                          {showInputEmojiUploadForm ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-main)', padding: '6px', borderRadius: '4px', marginBottom: '6px' }}>
                              <input 
                                type="text" 
                                placeholder=":code:" 
                                value={inputEmojiCode} 
                                onChange={(e) => setInputEmojiCode(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleUploadInputEmoji(e);
                                  }
                                }}
                                style={{ fontSize: '11px', padding: '2px 4px', background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '3px', color: 'var(--text-primary)' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button 
                                  type="button" 
                                  onClick={() => inputEmojiFileInputRef.current?.click()}
                                  style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--bg-active)', border: 'none', borderRadius: '3px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                                >
                                  <Upload size={10} />
                                  {inputEmojiFile ? inputEmojiFile.name.substring(0, 10) : (isEn ? 'Choose' : '選択')}
                                </button>
                                <input 
                                  type="file" 
                                  ref={inputEmojiFileInputRef} 
                                  onChange={(e) => setInputEmojiFile(e.target.files?.[0] || null)}
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                />
                                <button 
                                  type="button" 
                                  onClick={() => handleUploadInputEmoji()}
                                  disabled={uploadingInputEmoji}
                                  style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--accent-primary)', border: 'none', borderRadius: '3px', color: '#fff', cursor: 'pointer', marginLeft: 'auto' }}
                                >
                                  {uploadingInputEmoji ? (isEn ? 'Uploading...' : '中...') : (isEn ? 'Save' : '保存')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                              {customEmojis.length === 0 ? (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  {isEn ? 'No custom emojis' : 'なし'}
                                </span>
                              ) : (
                                customEmojis.map(emoji => (
                                  <button
                                    key={emoji.id}
                                    type="button"
                                    onClick={() => {
                                      setInputText(prev => prev + ' ' + emoji.code + ' ');
                                      setShowInputEmojiPicker(false);
                                    }}
                                    title={emoji.code}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                  >
                                    <img src={emoji.url} alt={emoji.code} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={!inputText.trim()}
                    title={isEn ? 'Send' : '送信'}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* チャットからの連携用モーダル */}
        <CreateItemModal
          isOpen={isItemModalOpen}
          onClose={() => {
            setIsItemModalOpen(false);
            setItemInitialData(null);
            setItemInitialType(null);
          }}
          channels={channels}
          workspaceMembers={workspaceMembers || []}
          workspaceStatuses={['todo', 'in_progress', 'done']}
          activeChannelId={activeChannelId}
          initialItem={itemInitialData}
          initialType={itemInitialType}
          onSave={handleSaveItemFromChat}
        />
      </div>



    </div>
  );
};

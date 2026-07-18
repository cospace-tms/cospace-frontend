import { useEffect, useRef, useState } from 'react';

interface UsePollingOptions {
  /** 現在選択されているチャンネル of ID */
  channelId: string | null;
  /**
   * メッセージのフェッチ処理を行う非同期関数。
   * 新しく取得したメッセージの件数をPromiseで返す必要があります。
   */
  onFetch: () => Promise<number>;
  /** 最小ポーリング間隔 (ミリ秒)。デフォルトは 5000ms (5秒) */
  minInterval?: number;
  /** 最大ポーリング間隔 (ミリ秒)。デフォルトは 15000ms (15秒) */
  maxInterval?: number;
}

/**
 * アイドル状態やブラウザのアクティブ状態、および Web Push (プッシュ通知) の有効化状況を監視し、
 * 最適なポーリング・同期を行うカスタムフック。
 */
export function usePolling({
  channelId,
  onFetch,
  minInterval = 5000,
  maxInterval = 15000,
}: UsePollingOptions) {
  // 現在のポーリング間隔
  const [intervalTime, setIntervalTime] = useState<number>(minInterval);
  // ブラウザのタブがアクティブかどうか
  const [isActive, setIsActive] = useState<boolean>(document.visibilityState === 'visible');
  // ユーザーがアイドル状態（離席）かどうか
  const [isIdle, setIsIdle] = useState<boolean>(false);
  // Web Push が有効かどうか
  const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);

  // 連続で新着メッセージが0件だった回数
  const consecutiveEmptyCount = useRef<number>(0);
  // setIntervalのタイマーID保持用
  const intervalIdRef = useRef<any>(null);
  // idleTimeoutのタイマーID保持用
  const idleTimeoutRef = useRef<any>(null);
  // 最新のonFetchを常に参照するためのref
  const onFetchRef = useRef(onFetch);

  // onFetchの参照を常に更新
  useEffect(() => {
    onFetchRef.current = onFetch;
  }, [onFetch]);

  // triggerImmediatePoll の宣言と再生成最小化
  const triggerImmediatePoll = useRef(async () => {
    if (!channelId) return;
    
    consecutiveEmptyCount.current = 0;
    setIntervalTime(minInterval);
    
    try {
      await onFetchRef.current();
    } catch (err) {
      console.error('Immediate fetch failed:', err);
    }
  });

  useEffect(() => {
    triggerImmediatePoll.current = async () => {
      if (!channelId) return;
      
      consecutiveEmptyCount.current = 0;
      setIntervalTime(minInterval);
      
      try {
        await onFetchRef.current();
      } catch (err) {
        console.error('Immediate fetch failed:', err);
      }
    };
  }, [channelId, minInterval]);

  // 1. Web Push (プッシュ通知) の登録状況をチェック
  useEffect(() => {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') {
      setIsPushEnabled(false);
      return;
    }

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsPushEnabled(!!sub);
      }).catch(() => {
        setIsPushEnabled(false);
      });
    }).catch(() => {
      setIsPushEnabled(false);
    });
  }, []);

  // 2. アイドル（離席）状態の監視
  useEffect(() => {
    const resetIdleTimer = () => {
      if (isIdle) {
        setIsIdle(false);
        // アイドルから復帰した時は即座に同期（フェッチ）を行う
        if (document.visibilityState === 'visible') {
          triggerImmediatePoll.current().catch((err) => {
            console.error('Wake up fetch failed:', err);
          });
        }
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 180000); // 3分 (180000ms)
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer));
    
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, [isIdle]);

  // 3. ブラウザタブの表示状態 (visibilityState) を監視
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsActive(visible);

      if (visible && !isIdle) {
        // アクティブに戻ったら即座に同期
        triggerImmediatePoll.current().catch((err) => {
          console.error('Visibility check fetch failed:', err);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    setIsActive(document.visibilityState === 'visible');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isIdle]);

  // 4. チャンネル変更時の即時取得
  useEffect(() => {
    if (!channelId) return;

    consecutiveEmptyCount.current = 0;
    setIntervalTime(minInterval);

    // 画面がアクティブかつ非アイドルの時は即座にメッセージを取得
    if (document.visibilityState === 'visible' && !isIdle) {
      onFetchRef.current().catch((err) => {
        console.error('Initial fetch failed on channel change:', err);
      });
    }
  }, [channelId, minInterval, isIdle]);

  // 5. 定期ポーリング制御
  useEffect(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    // ポーリングを停止する条件：
    // - チャンネル未選択
    // - タブ非表示 (isActive === false)
    // - アイドル（離席）状態 (isIdle === true)
    // - プッシュ通知が有効 (isPushEnabled === true)
    if (!channelId || !isActive || isIdle || isPushEnabled) {
      return;
    }

    const runPoll = async () => {
      try {
        const newCount = await onFetchRef.current();

        if (newCount > 0) {
          consecutiveEmptyCount.current = 0;
          if (intervalTime !== minInterval) {
            setIntervalTime(minInterval);
          }
        } else {
          consecutiveEmptyCount.current += 1;
          const count = consecutiveEmptyCount.current;
          let nextInterval = minInterval;

          if (count > 5) {
            nextInterval = maxInterval; // 最大15秒間隔
          } else if (count > 2) {
            nextInterval = Math.min(10000, maxInterval); // 10秒
          }

          if (nextInterval !== intervalTime) {
            setIntervalTime(nextInterval);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (intervalTime !== maxInterval) {
          setIntervalTime(maxInterval);
        }
      }
    };

    intervalIdRef.current = setInterval(runPoll, intervalTime);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [channelId, isActive, isIdle, isPushEnabled, intervalTime, minInterval, maxInterval]);

  // 6. Service Worker からの postMessage (プッシュ通知) 連携
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_RECEIVED') {
        const receivedChannelId = event.data.channelId;
        // 受信した通知が現在開いているチャンネル宛て、またはグローバルなプッシュ通知の場合、即座に同期を実行
        if (receivedChannelId === channelId || !receivedChannelId) {
          // プッシュ受信時は、タブが非表示/アイドルであっても強制的に1回フェッチを行う
          onFetchRef.current().catch((err) => {
            console.error('Immediate fetch failed on push notification:', err);
          });
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [channelId]);

  return {
    intervalTime,
    isActive: isActive && !isIdle,
    isPushEnabled,
    triggerImmediatePoll: () => triggerImmediatePoll.current(),
  };
}

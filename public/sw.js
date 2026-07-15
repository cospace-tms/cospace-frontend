// フロントエンド側 Service Worker (sw.js) - バックグラウンドでのプッシュ通知受信と処理

self.addEventListener('push', (event) => {
  let data = {
    title: 'Cohive',
    body: '新しいメッセージを受信しました。',
    linkUrl: '/'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    // 401 Unauthorized等の画像ロード失敗による通知表示クラッシュを防ぐためアイコン指定を排除
    data: {
      linkUrl: data.linkUrl
    },
    vibrate: [100, 50, 100],
    tag: 'cohive-notification', // 同じタグの通知は自動的にグループ化/上書きされる
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let linkUrl = event.notification.data?.linkUrl || '/';
  
  // 相対パスの場合は、明示的にService Workerのoriginを付与して絶対URL化（予期せぬAPIドメイン等への遷移を完全防止）
  if (linkUrl.startsWith('/')) {
    linkUrl = new URL(linkUrl, self.location.origin).toString();
  }

  console.log('[ServiceWorker] Notification clicked. Opening URL:', linkUrl);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既にアプリのタブが開いている場合は、そこへフォーカスしてURLへ遷移
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focusedClient) => {
            if ('navigate' in focusedClient) {
              return focusedClient.navigate(linkUrl);
            }
          });
        }
      }
      // 開いていなければ新しくタブを開く
      if (self.clients.openWindow) {
        return self.clients.openWindow(linkUrl);
      }
    })
  );
});

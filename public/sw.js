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
    icon: '/favicon.ico', // 公開ディレクトリに存在するアイコンを指定
    badge: '/favicon.ico',
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

  const linkUrl = event.notification.data?.linkUrl || '/';

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

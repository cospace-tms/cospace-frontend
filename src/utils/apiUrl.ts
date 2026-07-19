/**
 * APIやファイル用のURLを安全に正規化・解決するヘルパー関数
 * - もしDB等に保存されたURLに http://127.0.0.1:8787 などのローカル環境用ホスト名が含まれている場合、
 *   本番環境では自動的に削除して相対パス (/api/files/...) に変換します。
 * - 相対パスの場合は、適切な先頭のスラッシュ付きパスとして返します。
 */
export function getApiUrl(url: string | null | undefined): string {
  if (!url) return '';

  // 既に blob: や data: の場合はそのまま
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }

  // 127.0.0.1:8787 または localhost:8787 が含まれており、現環境がそのホストでない場合は相対パスへ書き換え
  if (url.includes('127.0.0.1:8787') || url.includes('localhost:8787')) {
    if (typeof window !== 'undefined' && !window.location.host.includes('8787')) {
      url = url.replace(/^https?:\/\/[^/]+/, '');
    }
  }

  // http:// や https:// で始まるフルURLの場合はそのまま返す
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 相対パスを補正
  return url.startsWith('/') ? url : `/${url}`;
}

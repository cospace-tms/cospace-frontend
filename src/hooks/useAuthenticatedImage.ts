import { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiUrl';

/**
 * 認証ヘッダー(X-User-Id)を付与して画像を取得し、
 * メモリ内限定の Blob URL (blob:http://...) を生成・管理するカスタムフック
 */
export function useAuthenticatedImage(src: string | null | undefined) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setBlobUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    const resolvedSrc = getApiUrl(src);
    const isApiFile = resolvedSrc.includes('/api/files/download/') || resolvedSrc.includes('/api/files/');

    if (!isApiFile) {
      setBlobUrl(resolvedSrc);
      setLoading(false);
      setError(false);
      return;
    }

    let isMounted = true;
    let createdUrl: string | null = null;

    const fetchImage = async () => {
      setLoading(true);
      setError(false);

      try {
        const userId = localStorage.getItem('cohive_user_id') || '';
        const token = localStorage.getItem('cohive_auth_token') || '';

        const headers: HeadersInit = {};
        if (userId) {
          headers['X-User-Id'] = userId;
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(resolvedSrc, { headers });

        if (!res.ok) {
          throw new Error(`Failed to load image: ${res.status}`);
        }

        const blob = await res.blob();
        if (isMounted) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching authenticated image:", err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  return { blobUrl, loading, error };
}

/**
 * 認証ヘッダーを付与してファイルを安全にダウンロードするヘルパー関数
 */
export async function downloadAuthenticatedFile(fileUrl: string, fileName: string) {
  try {
    const userId = localStorage.getItem('cohive_user_id') || '';
    const token = localStorage.getItem('cohive_auth_token') || '';
    const fullUrl = getApiUrl(fileUrl);

    const headers: HeadersInit = {};
    if (userId) headers['X-User-Id'] = userId;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(fullUrl, { headers });
    if (!res.ok) {
      throw new Error(`Download failed with status: ${res.status}`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    console.error('Error downloading file:', err);
    alert('ファイルのダウンロードに失敗しました。');
  }
}

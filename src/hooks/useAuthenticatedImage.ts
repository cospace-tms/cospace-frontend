import { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiUrl';
import { apiClient } from '../utils/apiClient';

/**
 * 認証ヘッダー(Authorization, X-User-Id)を付与して画像を取得し、
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
        const userId = apiClient.getUserId() || localStorage.getItem('selected_user_id') || localStorage.getItem('cohive_user_id') || '';
        const token = apiClient.getToken() || localStorage.getItem('cohive_auth_token') || '';

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
 * 認証用パラメータ(user_id, token)をクエリに埋め込んだ直リンクURLを生成
 */
export function getAuthenticatedFileUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  const fullUrl = getApiUrl(fileUrl);
  if (!fullUrl.includes('/api/files/')) return fullUrl;

  const userId = apiClient.getUserId() || localStorage.getItem('selected_user_id') || localStorage.getItem('cohive_user_id') || '';
  const token = apiClient.getToken() || localStorage.getItem('cohive_auth_token') || '';

  try {
    const urlObj = new URL(fullUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (userId && !urlObj.searchParams.has('user_id') && !urlObj.searchParams.has('userId')) {
      urlObj.searchParams.set('user_id', userId);
    }
    if (token && !urlObj.searchParams.has('token')) {
      urlObj.searchParams.set('token', token);
    }
    return urlObj.toString();
  } catch (e) {
    return fullUrl;
  }
}

/**
 * 認証ヘッダー/パラメータを付与してファイルを安全にダウンロードするヘルパー関数
 */
export async function downloadAuthenticatedFile(fileUrl: string, fileName: string) {
  try {
    const authUrl = getAuthenticatedFileUrl(fileUrl);
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      // iOS Safari の場合は Blob URL ではなく直リンクアクセス (Content-Disposition: attachment) でダウンロード/表示を開く
      window.open(authUrl, '_blank');
      return;
    }

    const a = document.createElement('a');
    a.href = authUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('Error downloading file:', err);
    alert('ファイルのダウンロードに失敗しました。');
  }
}

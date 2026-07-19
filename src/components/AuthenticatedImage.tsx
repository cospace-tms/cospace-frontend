import React from 'react';
import { useAuthenticatedImage } from '../hooks/useAuthenticatedImage';
import { ImageOff } from 'lucide-react';

interface AuthenticatedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onClick'> {
  src: string | null | undefined;
  fallbackText?: string;
  onClick?: (e: React.MouseEvent<HTMLImageElement | HTMLDivElement>, blobUrl: string | null) => void;
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt,
  style,
  className,
  fallbackText,
  onClick,
  ...rest
}) => {
  const { blobUrl, loading, error } = useAuthenticatedImage(src);

  const handleClick = (e: React.MouseEvent<HTMLImageElement | HTMLDivElement>) => {
    if (onClick) {
      onClick(e, blobUrl);
    }
  };

  if (loading) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          minWidth: '60px',
          minHeight: '60px',
          borderRadius: style?.borderRadius || '8px',
          color: 'var(--text-muted, #888)',
          fontSize: '12px',
          ...style,
        }}
      >
        <span>...</span>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'var(--bg-panel, #2a2a32)',
          border: '1px solid var(--border-light, #333)',
          borderRadius: style?.borderRadius || '8px',
          padding: '12px',
          color: 'var(--text-muted, #888)',
          fontSize: '12px',
          gap: '4px',
          ...style,
        }}
        onClick={handleClick}
      >
        <ImageOff size={20} />
        <span>{fallbackText || '画像を読み込めません'}</span>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt || 'Image'}
      style={style}
      className={className}
      onClick={handleClick}
      {...rest}
    />
  );
};

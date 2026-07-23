import { useEffect, useState } from 'react';

export interface BrandingSettings {
  custom_logo_url?: string;
  primary_color?: string;
  brand_name?: string;
}

export function useBranding(workspaceId: string | null) {
  const [branding, setBranding] = useState<BrandingSettings | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setBranding(null);
      return;
    }

    const fetchBranding = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/branding`);
        if (res.ok) {
          const data = await res.json() as any;
          if (data.success && data.branding) {
            setBranding(data.branding);
            
            // プライマリカラーの適用
            if (data.branding.primary_color && data.branding.primary_color.trim()) {
              document.documentElement.style.setProperty('--primary-color', data.branding.primary_color);
            }
            // ブランド名の動的タイトル適用
            if (data.branding.brand_name && data.branding.brand_name.trim()) {
              document.title = data.branding.brand_name;
            }
          }
        }
      } catch (e) {
        // エラー時は初期表示維持
      }
    };

    fetchBranding();
  }, [workspaceId]);

  return branding;
}

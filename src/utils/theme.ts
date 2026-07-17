/**
 * PWAのウィンドウコントロールオーバーレイ（WCO）等の背景色をテーマに合わせて更新する
 */
export const updateThemeColorMeta = (theme: 'light' | 'dark') => {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    // それぞれのテーマの --bg-sidebar の色に合わせる
    const color = theme === 'light' ? '#f8fafc' : '#15181f';
    metaThemeColor.setAttribute('content', color);
  }
};

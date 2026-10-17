import type { CapacitorConfig } from '@capacitor/cli';

// The appId is a placeholder; the store ID is chosen in Phase 11 and is permanent after the
// first upload. WebView debugging is Capacitor's default: on in debug builds, off in release.
const config: CapacitorConfig = {
  appId: 'com.jupiterlabtech.kanche.dev',
  appName: 'Kanche',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      // Real insets in env(safe-area-inset-*), plus --safe-area-inset-* for WebViews below 140
      // (src/safe-area.ts reads both).
      insetsHandling: 'css',
      // Light icons over the dark letterbox.
      style: 'DARK',
    },
  },
};

export default config;

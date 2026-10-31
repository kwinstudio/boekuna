import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '../components/Toast';
import { loadStore, useStore } from '../lib/store';
import { useBackgroundSync } from '../lib/sync';
import { autoBackup } from '../lib/extras';
import { useRef } from 'react';
import { useTheme } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const loaded = useStore((s) => s.loaded);
  const t = useTheme();

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  useBackgroundSync(loaded);

  // Backup stil bijwerken als er lijsten bijkomen of verdwijnen.
  const tokens = useStore((s) => Object.values(s.lists).filter((l) => !l.needsCreate).map((l) => l.token).sort().join(','));
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (prev.current !== null && prev.current !== tokens) {
      const before = prev.current.split(',').filter(Boolean);
      const now = new Set(tokens.split(','));
      autoBackup(before.filter((x) => !now.has(x))).catch(() => {});
    }
    prev.current = tokens;
  }, [loaded, tokens]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      <ToastHost />
    </SafeAreaProvider>
  );
}

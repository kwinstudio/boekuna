import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '../components/Toast';
import { getState, loadStore, useStore } from '../lib/store';
import { useBackgroundSync } from '../lib/sync';
import { autoBackup } from '../lib/extras';
import { registerAll, setupPushHandlers } from '../lib/push';
import { refreshNudges } from '../lib/nudge';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting, type RouterAction } from 'expo-quick-actions/router';
import { Platform } from 'react-native';
import { t as tr } from '../lib/i18n';
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

  // Snelle acties onder het app-icoon (lang indrukken): met de naam van de laatst gebruikte lijst.
  const recentName = useStore((s) => {
    const l = Object.values(s.lists).filter((x) => !x.base.list.archived).sort((a, b) => (b.lastSyncAt ?? b.joinedAt) - (a.lastSyncAt ?? a.joinedAt))[0];
    return l?.base.list.name ?? '';
  });
  useEffect(() => {
    if (!loaded || Platform.OS !== 'ios') return;
    const items: RouterAction[] = recentName
      ? [
          { id: 'add', title: tr('qaAdd'), subtitle: recentName, icon: 'symbol:plus.circle', params: { href: '/add' } },
          { id: 'scan', title: tr('qaScan'), subtitle: recentName, icon: 'symbol:doc.text.viewfinder', params: { href: '/add?scan=1' } },
          { id: 'new', title: tr('qaNew'), icon: 'symbol:person.2', params: { href: '/new' } },
        ]
      : [{ id: 'new', title: tr('qaNew'), icon: 'symbol:person.2', params: { href: '/new' } }];
    QuickActions.setItems(items).catch(() => {});
  }, [loaded, recentName]);

  // Backup stil bijwerken als er lijsten bijkomen of verdwijnen.
  const tokens = useStore((s) => Object.values(s.lists).filter((l) => !l.needsCreate && !l.demo).map((l) => l.token).sort().join(','));
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (prev.current !== null && prev.current !== tokens) {
      const before = prev.current.split(',').filter(Boolean);
      const now = new Set(tokens.split(','));
      autoBackup(before.filter((x) => !now.has(x))).catch(() => {});
    }
    prev.current = tokens;
    // Toestel (opnieuw) aanmelden voor meldingen bij nieuwe lijsten of een nieuw token.
    if (getState().profile.pushOn !== undefined) registerAll().catch(() => {});
  }, [loaded, tokens]);

  // Terugbetaal-herinneringen bijwerken als saldi veranderen (licht vertraagd).
  const revs = useStore((s) => Object.values(s.lists).map((l) => `${l.id}:${l.base.list.rev}:${l.pending.length}`).join('|'));
  const payNudge = useStore((s) => s.profile.payNudge);
  useEffect(() => {
    if (!loaded) return;
    const tm = setTimeout(() => refreshNudges(), 1500);
    return () => clearTimeout(tm);
  }, [loaded, revs, payNudge]);

  useEffect(() => {
    if (!loaded) return;
    let off = () => {};
    setupPushHandlers().then((f) => (off = f)).catch(() => {});
    return () => off();
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
      <ToastHost />
      <QuickActionRouting />
    </SafeAreaProvider>
  );
}

/** Pas actief als de navigatie er is, zodat een snelle actie bij een koude start goed landt. */
function QuickActionRouting() {
  useQuickActionRouting();
  return null;
}

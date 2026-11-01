import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { extractToken } from '../lib/ids';
import { ActionSheetIOS, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListBadge } from '../components/LookPicker';
import { BottomBar } from '../components/BottomBar';
import { listLook } from '../lib/look';
import { Avatar, Button, Card, IconButton, Screen } from '../components/ui';
import { listTransfers } from '../lib/balances';
import { restoreBackup } from '../lib/extras';
import { showToast } from '../components/Toast';
import { Platform } from 'react-native';
import { money } from '../lib/domain';
import { plural, t } from '../lib/i18n';
import { createDemoList, useStore, viewOf } from '../lib/store';
import { num, usePalette, useTheme, type Hue } from '../lib/theme';
import type { LocalList } from '../lib/types';

type Row = { local: LocalList; name: string; members: string[]; entries: number; balance: number; currency: string; archived: boolean; open: number; hue: Hue; icon: ReturnType<typeof listLook>['icon'] };

export default function Home() {
  const th = useTheme();
  const lists = useStore((s) => s.lists);
  const [showArchived, setShowArchived] = useState(false);

  const rows: Row[] = useMemo(() => {
    return Object.values(lists)
      .map((local) => {
        const v = viewOf(local)!;
        const { transfers: trs, rep, balances } = listTransfers(v.entries, v.members, v.list.settings);
        const bal = local.me ? (balances[local.me] ?? 0) : 0;
        const unit = local.me ? (rep.get(local.me) ?? local.me) : null;
        const open = unit ? trs.filter((x) => x.from === unit || x.to === unit).length : 0;
        const look = listLook(v.list);
        return {
          local,
          name: v.list.name,
          members: v.members.filter((m) => !m.deleted).map((m) => m.name),
          entries: v.entries.filter((e) => e.kind !== 'transfer').length,
          balance: bal,
          currency: v.list.currency,
          archived: v.list.archived,
          open,
          hue: look.hue,
          icon: look.icon,
        };
      })
      .sort((a, b) => b.local.joinedAt - a.local.joinedAt);
  }, [lists]);

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);
  const totalEur = active.filter((r) => r.currency === 'EUR').reduce((s, r) => s + r.balance, 0);
  const getsEur = active.filter((r) => r.currency === 'EUR' && r.balance > 0).reduce((x, r) => x + r.balance, 0);
  const owesEur = active.filter((r) => r.currency === 'EUR' && r.balance < 0).reduce((x, r) => x - r.balance, 0);
  const profileName = useStore((s) => s.profile.name);
  const hour = new Date().getHours();
  const greeting = t(hour < 6 ? 'greetNight' : hour < 12 ? 'greetMorning' : hour < 18 ? 'greetAfternoon' : 'greetEvening', { name: profileName || '' }).replace(/,\s*$/, '');

  if (rows.length === 0) return <Welcome />;

  return (
    <Screen bottom={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, marginTop: 4 }}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: '500', color: th.sub }}>{greeting}</Text>
          <Text accessibilityRole="header" style={{ fontSize: 34, fontWeight: '800', letterSpacing: -1, color: th.text }}>
            {t('lists')}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings')} onPress={() => router.push('/settings')} hitSlop={8}>
          <Avatar name={profileName || '?'} size={40} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        <View style={{ backgroundColor: th.hero, borderRadius: 24, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, marginBottom: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: th.onHero, opacity: 0.85 }}>{t('acrossLists')}</Text>
          <Text style={[{ fontSize: 36, fontWeight: '800', letterSpacing: -1.2, color: th.onHero, marginTop: 2 }, num]} adjustsFontSizeToFit numberOfLines={1}>
            {totalEur === 0 ? t('allSquareShort') : `${totalEur > 0 ? '+ ' : '− '}${money(Math.abs(totalEur))}`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: 'center' }}>
              <Text style={[{ fontSize: 13, fontWeight: '700', color: th.onHero }, num]}>{t('heroGet', { amount: money(getsEur) })}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 12, height: 28, justifyContent: 'center' }}>
              <Text style={[{ fontSize: 13, fontWeight: '700', color: th.onHero }, num]}>{t('heroOwe', { amount: money(owesEur) })}</Text>
            </View>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {active.map((r) => (
            <ListRow key={r.local.id} row={r} />
          ))}
        </View>
        {archived.length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
              onPress={() => setShowArchived((v) => !v)}
              style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 10 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: th.sub }}>{t('archivedCount', { n: archived.length })}</Text>
              <Ionicons name={showArchived ? 'chevron-down' : 'chevron-forward'} size={18} color={th.sub} />
            </Pressable>
            {showArchived ? (
              <View style={{ gap: 10 }}>
                {archived.map((r) => (
                  <ListRow key={r.local.id} row={r} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <BottomBar active="lists" />
    </Screen>
  );
}

function ListRow({ row }: { row: Row }) {
  const th = useTheme();
  const pending = row.local.pending.length > 0 || row.local.needsCreate;
  const pos = usePalette('teal');
  const neg = usePalette('coral');
  const pill = row.balance > 0 ? pos : neg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.balance === 0 ? t('square') : `${row.balance > 0 ? t('youGet') : t('youPay')} ${money(Math.abs(row.balance), row.currency)}`}${row.open ? `. ${t('openBadgeA11y', { n: row.open })}` : ''}`}
      onPress={() => router.push(`/list/${row.local.id}`)}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
        <View>
          <ListBadge hue={row.hue} icon={row.icon} size={48} />
          {row.open > 0 && !row.archived ? (
            <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: th.owe, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: th.card }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{row.open}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: th.text }}>
            {row.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
            {row.members.slice(0, 4).map((n, i) => (
              <View key={`${n}-${i}`} style={{ marginLeft: i ? -7 : 0 }}>
                <Avatar name={n} size={22} ring={th.card} />
              </View>
            ))}
            <Text style={{ fontSize: 13, color: th.sub, marginLeft: 8 }}>
              {row.members.length > 4 ? `+${row.members.length - 4} · ` : ''}
              {plural(row.entries, 'expensesOne', 'expensesMany')}
            </Text>
            {pending ? <Ionicons name="cloud-upload-outline" size={14} color={th.sub} style={{ marginLeft: 6 }} accessibilityLabel={t('waitingSync')} /> : null}
          </View>
        </View>
        {row.balance === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: th.segment }}>
            <Ionicons name="checkmark" size={15} color={th.sub} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub }}>{t('square')}</Text>
          </View>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[{ fontSize: 16, fontWeight: '800', color: row.balance > 0 ? th.gain : th.owe }, num]}>
              {row.balance > 0 ? '+ ' : '− '}
              {money(Math.abs(row.balance), row.currency)}
            </Text>
            <Text style={{ fontSize: 12, color: th.sub }}>{row.balance > 0 ? t('youGetLower') : t('toSettleLower')}</Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function Welcome() {
  const th = useTheme();
  const profileName = useStore((s) => s.profile.name);
  const [hasClip, setHasClip] = useState(false);
  useEffect(() => {
    // Alleen kijken óf er iets op het klembord staat (geen melding); plakken gebeurt pas als je tikt.
    Clipboard.hasStringAsync().then(setHasClip).catch(() => {});
  }, []);

  const pasteInvite = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const token = extractToken(text ?? '');
    if (token) router.push({ pathname: '/join/[token]', params: { token } });
    else router.push('/join');
  };

  const demo = () => {
    const id = createDemoList(profileName, {
      name: t('demoName'),
      items: [
        [t('demoItem1'), 6420, 0, 'groceries'],
        [t('demoItem2'), 36000, 1, 'stay'],
        [t('demoItem3'), 4800, 2, 'transport'],
        [t('roundTitle'), 1800, 0, 'drinks'],
      ],
    });
    router.push(`/list/${id}`);
  };

  return (
    <Screen style={{ paddingHorizontal: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: th.accent, marginBottom: 8 }}>Quitte</Text>
        <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700', letterSpacing: -0.6, color: th.text, marginBottom: 10 }}>
          {t('welcomeTitle')}
        </Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: th.sub }}>{t('welcomeBody')}</Text>
        <View style={{ marginTop: 22, backgroundColor: th.card, borderRadius: 14 }}>
          {(['welcomePoint1', 'welcomePoint2', 'welcomePoint3'] as const).map((k, i) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 50, paddingHorizontal: 16, borderBottomWidth: i < 2 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}>
              <Ionicons name="checkmark-circle" size={20} color={th.gain} />
              <Text style={{ fontSize: 16, color: th.text, flex: 1 }}>{t(k)}</Text>
            </View>
          ))}
        </View>
        {hasClip ? (
          <Pressable
            accessibilityRole="button"
            onPress={pasteInvite}
            style={({ pressed }) => [{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: th.accentSoft }, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="mail-open-outline" size={22} color={th.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: th.accentText }}>{t('pasteInviteTitle')}</Text>
              <Text style={{ fontSize: 13, color: th.accentText }}>{t('pasteInviteBody')}</Text>
            </View>
            <Ionicons name="clipboard-outline" size={20} color={th.accentText} />
          </Pressable>
        ) : null}
      </View>
      <Button label={t('newList')} onPress={() => router.push('/new')} style={{ marginBottom: 10 }} />
      <Button label={t('demoCta')} kind="secondary" icon="play-circle-outline" onPress={demo} style={{ marginBottom: 6 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18 }}>
        <TextLink label={t('haveInvite')} onPress={() => router.push('/join')} />
        <TextLink label={t('importCta')} onPress={() => router.push('/import')} />
        {Platform.OS === 'ios' ? (
          <TextLink
            label={t('restoreShort')}
            onPress={async () => {
              try {
                const n = await restoreBackup();
                showToast(n ? t('restoredLists', { n }) : t('restoreNone'));
              } catch {
                showToast(t('restoreNone'));
              }
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.5 }]}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: th.accent }}>{label}</Text>
    </Pressable>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Avatar, Button, Card, IconButton, Screen } from '../components/ui';
import { computeBalances, directTransfers, settle } from '../lib/balances';
import { restoreBackup } from '../lib/extras';
import { showToast } from '../components/Toast';
import { Platform } from 'react-native';
import { money } from '../lib/domain';
import { plural, t } from '../lib/i18n';
import { useStore, viewOf } from '../lib/store';
import { useTheme } from '../lib/theme';
import type { LocalList } from '../lib/types';

type Row = { local: LocalList; name: string; members: number; entries: number; balance: number; currency: string; archived: boolean; open: number };

export default function Home() {
  const th = useTheme();
  const lists = useStore((s) => s.lists);
  const [showArchived, setShowArchived] = useState(false);

  const rows: Row[] = useMemo(() => {
    return Object.values(lists)
      .map((local) => {
        const v = viewOf(local)!;
        const balances = computeBalances(v.entries, v.members);
        const bal = local.me ? (balances[local.me] ?? 0) : 0;
        const order = v.members.map((m) => m.id);
        const trs = v.list.settings?.directDebts ? directTransfers(v.entries, order) : settle(balances, order);
        const open = local.me ? trs.filter((x) => x.from === local.me || x.to === local.me).length : 0;
        return {
          local,
          name: v.list.name,
          members: v.members.filter((m) => !m.deleted).length,
          entries: v.entries.filter((e) => e.kind !== 'transfer').length,
          balance: bal,
          currency: v.list.currency,
          archived: v.list.archived,
          open,
        };
      })
      .sort((a, b) => b.local.joinedAt - a.local.joinedAt);
  }, [lists]);

  const active = rows.filter((r) => !r.archived);
  const archived = rows.filter((r) => r.archived);
  const totalEur = active.filter((r) => r.currency === 'EUR').reduce((s, r) => s + r.balance, 0);

  if (rows.length === 0) return <Welcome />;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, marginTop: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: th.text }}>
          {t('yourLists')}
        </Text>
        <IconButton icon="person-outline" label={t('settings')} onPress={() => router.push('/settings')} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ backgroundColor: th.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 18 }}>
          <Text style={{ fontSize: 13, color: th.sub, marginBottom: 2 }}>{t('acrossLists')}</Text>
          <Text style={{ fontSize: 22, fontWeight: '600', color: totalEur === 0 ? th.text : totalEur < 0 ? th.owe : th.gain }}>
            {totalEur === 0
              ? t('allSquare')
              : totalEur > 0
                ? t('youGetTotal', { amount: money(totalEur) })
                : t('youPayTotal', { amount: money(-totalEur) })}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          {active.map((r, i) => (
            <ListRow key={r.local.id} row={r} index={i} />
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
                {archived.map((r, i) => (
                  <ListRow key={r.local.id} row={r} index={i + active.length} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8 }}>
        <Button label={t('newList')} icon="add" onPress={() => router.push('/new')} style={{ flex: 1 }} />
        <IconButton icon="qr-code-outline" label={t('joinWithCode')} size={50} onPress={() => router.push('/join')} />
      </View>
    </Screen>
  );
}

function ListRow({ row, index }: { row: Row; index: number }) {
  const th = useTheme();
  const pending = row.local.pending.length > 0 || row.local.needsCreate;
  const label =
    row.balance === 0 ? t('square') : row.balance > 0 ? t('youGet') : t('youPay');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.name}. ${row.balance === 0 ? t('square') : `${label} ${money(Math.abs(row.balance), row.currency)}`}`}
      onPress={() => router.push(`/list/${row.local.id}`)}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 }}>
        <Avatar name={row.name} index={index + 1} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: th.text, flexShrink: 1 }}>
              {row.name}
            </Text>
            {row.open > 0 && !row.archived ? (
              <View accessibilityLabel={t('openBadgeA11y', { n: row.open })} style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: th.owe, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{row.open}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 13, color: th.sub }}>
              {plural(row.members, 'peopleOne', 'peopleMany')} · {plural(row.entries, 'expensesOne', 'expensesMany')}
            </Text>
            {pending ? <Ionicons name="cloud-upload-outline" size={14} color={th.sub} accessibilityLabel={t('waitingSync')} /> : null}
          </View>
        </View>
        {row.balance === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark" size={18} color={th.sub} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.sub }}>{t('square')}</Text>
          </View>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: th.sub }}>{label}</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: row.balance > 0 ? th.gain : th.owe }}>
              {row.balance > 0 ? '+ ' : '− '}
              {money(Math.abs(row.balance), row.currency)}
            </Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

function Welcome() {
  const th = useTheme();
  return (
    <Screen style={{ paddingHorizontal: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: th.accent, marginBottom: 8 }}>Quitte</Text>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', color: th.text, marginBottom: 10 }}>
          {t('welcomeTitle')}
        </Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: th.sub }}>{t('welcomeBody')}</Text>
        <View style={{ marginTop: 24, backgroundColor: th.card, borderRadius: 12 }}>
          {(['welcomePoint1', 'welcomePoint2', 'welcomePoint3'] as const).map((k, i) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 50, paddingHorizontal: 16, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: th.line }}>
              <Ionicons name="checkmark" size={18} color={th.sub} />
              <Text style={{ fontSize: 16, color: th.text, flex: 1 }}>{t(k)}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button label={t('newList')} onPress={() => router.push('/new')} style={{ marginBottom: 10 }} />
      <Button label={t('haveInvite')} kind="ghost" onPress={() => router.push('/join')} />
      {Platform.OS === 'ios' ? (
        <Button
          label={t('restoreCta')}
          kind="ghost"
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
    </Screen>
  );
}

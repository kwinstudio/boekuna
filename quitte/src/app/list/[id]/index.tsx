import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { showToast } from '../../../components/Toast';
import { Avatar, Button, Card, CategoryIcon, IconButton, Screen, Segmented, TopBar } from '../../../components/ui';
import { computeBreakdown, settle, totalSpent, type Transfer } from '../../../lib/balances';
import { categoryById } from '../../../lib/categories';
import { activeMembers, money, myShare, nameOf, payerLine } from '../../../lib/domain';
import { dayLabel, t } from '../../../lib/i18n';
import { nowIso, todayIso, uuid } from '../../../lib/ids';
import { shareInvite, shareOverview, shareRequest } from '../../../lib/share';
import { enqueue, updateLocal, useList } from '../../../lib/store';
import { syncList, useLiveList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';
import type { Entry, ListState } from '../../../lib/types';

type Tab = 'expenses' | 'balances';

export default function ListScreen() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { local, view } = useList(id);
  const [tab, setTab] = useState<Tab>('expenses');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  useLiveList(id);

  const calc = useMemo(() => {
    if (!view) return null;
    const bd = computeBreakdown(view.entries, view.members);
    const balances = Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, v.balance]));
    const order = view.members.map((m) => m.id);
    return { bd, balances, transfers: settle(balances, order), total: totalSpent(view.entries) };
  }, [view]);

  if (!local || !view || !calc) {
    return (
      <Screen>
        <TopBar backLabel={t('lists')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: th.sub }}>{t('listGone')}</Text>
        </View>
      </Screen>
    );
  }

  const me = local.me;
  const cur = view.list.currency;
  const myBal = me ? (calc.balances[me] ?? 0) : 0;
  const myOut = calc.transfers.filter((x) => x.from === me);

  const refresh = async () => {
    setRefreshing(true);
    await syncList(local.id);
    setRefreshing(false);
  };

  const markPaid = (tr: Transfer) => {
    const batchId = uuid();
    const ts = nowIso();
    const entry: Entry = {
      id: uuid(),
      kind: 'transfer',
      title: t('repayment'),
      amount: tr.amount,
      date: todayIso(),
      payers: [{ m: tr.from, a: tr.amount }],
      shares: [{ m: tr.to, a: tr.amount }],
      splitMode: 'amounts',
      batchId,
      createdBy: me,
      updatedAt: ts,
    };
    enqueue(local.id, {
      op: 'entry',
      data: entry,
      summary: t('actPaid', { from: nameOf(view, tr.from), to: nameOf(view, tr.to), amount: money(tr.amount, cur) }),
    });
    syncList(local.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(t('paymentSaved'), t('undo'), () => {
      enqueue(local.id, { op: 'delete_batch', batchId, data: { updatedAt: nowIso() }, summary: t('actUndo') });
      syncList(local.id);
    });
  };

  const settleAll = () => {
    if (calc.transfers.length === 0) return;
    Alert.alert(t('settleAllTitle'), t('settleAllBody', { n: calc.transfers.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settleAllCta'),
        onPress: () => {
          const batchId = uuid();
          const ts = nowIso();
          enqueue(
            local.id,
            calc.transfers.map((tr, i) => ({
              op: 'entry' as const,
              data: {
                id: uuid(),
                kind: 'transfer' as const,
                title: t('repayment'),
                amount: tr.amount,
                date: todayIso(),
                payers: [{ m: tr.from, a: tr.amount }],
                shares: [{ m: tr.to, a: tr.amount }],
                splitMode: 'amounts' as const,
                batchId,
                createdBy: me,
                updatedAt: ts,
              },
              summary: i === 0 ? t('actSettledAll') : undefined,
            })),
          );
          syncList(local.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          router.push({
            pathname: '/list/[id]/done',
            params: { id: local.id, batch: batchId, count: String(calc.transfers.length), total: String(calc.total) },
          });
        },
      },
    ]);
  };

  const addOther = () => {
    Alert.alert(t('addWhat'), undefined, [
      { text: t('kindIncome'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, kind: 'income' } }) },
      { text: t('kindTransfer'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, kind: 'transfer' } }) },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const status =
    local.syncError === 'not_found'
      ? t('statusGone')
      : local.syncError === 'rejected'
        ? t('statusRejected')
        : local.pending.length > 0 || local.needsCreate || local.syncError === 'offline'
          ? t('statusOffline')
          : null;

  const names = activeMembers(view).map((m) => (m.id === me ? t('you') : m.name));

  return (
    <Screen>
      <TopBar
        backLabel={t('lists')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        right={
          <>
            {tab === 'expenses' ? (
              <IconButton
                icon={searchOpen ? 'close' : 'search'}
                label={searchOpen ? t('closeSearch') : t('search')}
                onPress={() => {
                  setSearchOpen((v) => !v);
                  setQuery('');
                }}
              />
            ) : null}
            <IconButton icon="people-outline" label={t('manageList')} onPress={() => router.push({ pathname: '/list/[id]/manage', params: { id: local.id } })} />
          </>
        }
      />
      <View style={{ paddingHorizontal: 20 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: th.text }}>
          {view.list.name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 14, color: th.sub, marginTop: 2, marginBottom: 12 }}>
          {names.join(', ')}
        </Text>

        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: th.sub }}>
              {myBal === 0 ? t('status') : myBal > 0 ? t('youStillGet') : t('youStillPay')}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: myBal === 0 ? th.text : myBal > 0 ? th.gain : th.owe }}>
              {myBal === 0 ? t('youreSquare') : money(Math.abs(myBal), cur)}
              {myBal < 0 && myOut.length === 1 ? (
                <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}> {t('toName', { name: nameOf(view, myOut[0].to) })}</Text>
              ) : null}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('together')} ${money(calc.total, cur)}. ${t('stats')}`}
            onPress={() => router.push({ pathname: '/list/[id]/stats', params: { id: local.id } })}
            style={{ alignItems: 'flex-end', paddingLeft: 12, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, color: th.sub }}>{t('together')}</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>{money(calc.total, cur)}</Text>
          </Pressable>
        </Card>

        {status ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              updateLocal(local.id, { syncError: null });
              syncList(local.id);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}
          >
            <Ionicons name={local.syncError === 'not_found' ? 'warning-outline' : 'cloud-offline-outline'} size={15} color={th.sub} />
            <Text style={{ fontSize: 13, color: th.sub, flex: 1 }}>{status}</Text>
          </Pressable>
        ) : null}

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: t('tabExpenses') },
            { value: 'balances', label: t('tabBalances') },
          ]}
        />
        {searchOpen && tab === 'expenses' ? (
          <TextInput
            accessibilityLabel={t('search')}
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={th.sub}
            clearButtonMode="while-editing"
            style={{ height: 44, borderRadius: 12, backgroundColor: th.card, paddingHorizontal: 14, fontSize: 16, color: th.text, marginTop: 10 }}
          />
        ) : null}
      </View>

      {tab === 'expenses' ? (
        <Expenses view={view} me={me} query={query} refreshing={refreshing} onRefresh={refresh} listId={local.id} token={local.token} />
      ) : (
        <Balances view={view} me={me} calc={calc} refreshing={refreshing} onRefresh={refresh} onPaid={markPaid} />
      )}

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 }}>
        {tab === 'expenses' ? (
          <>
            <Button
              label={t('expense')}
              icon="add"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/list/[id]/entry', params: { id: local.id } })}
            />
            <IconButton icon="ellipsis-horizontal" label={t('addOther')} size={56} onPress={addOther} />
          </>
        ) : (
          <>
            <Button label={t('share')} kind="secondary" icon="share-outline" style={{ flex: 1 }} onPress={() => shareOverview(view, calc.transfers)} />
            <Button label={t('allPaid')} style={{ flex: 1 }} onPress={settleAll} disabled={calc.transfers.length === 0} />
          </>
        )}
      </View>
    </Screen>
  );
}

function Expenses({
  view,
  me,
  query,
  refreshing,
  onRefresh,
  listId,
  token,
}: {
  view: ListState;
  me: string | null;
  query: string;
  refreshing: boolean;
  onRefresh: () => void;
  listId: string;
  token: string;
}) {
  const th = useTheme();
  const cur = view.list.currency;
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = view.entries.filter((e) => {
      if (!q) return true;
      const cat = categoryById(e.category);
      const hay = [e.title, t(`cat_${cat.id}` as never), ...e.payers.map((p) => nameOf(view, p.m)), ...e.shares.map((p) => nameOf(view, p.m))]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    const map = new Map<string, Entry[]>();
    for (const e of filtered) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()].map(([date, data]) => ({ title: dayLabel(date), data }));
  }, [view, query]);

  if (view.entries.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.sub} />}
      >
        <Card style={{ padding: 20, alignItems: 'center', gap: 8 }}>
          <Ionicons name="receipt-outline" size={32} color={th.accent} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: th.text }}>{t('emptyTitle')}</Text>
          <Text style={{ fontSize: 15, color: th.sub, textAlign: 'center', lineHeight: 21 }}>{t('emptyBody')}</Text>
          <Button label={t('inviteOthers')} kind="secondary" icon="person-add-outline" onPress={() => shareInvite(view.list.name, token)} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.sub} />}
      ListEmptyComponent={<Text style={{ color: th.sub, textAlign: 'center', marginTop: 24 }}>{t('noResults')}</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, paddingTop: 14, paddingBottom: 4 }}>{section.title}</Text>
      )}
      renderItem={({ item: e }) => {
        const cat = e.kind === 'transfer' ? null : categoryById(e.category);
        const share = myShare(e, me);
        const right =
          e.kind === 'transfer'
            ? ''
            : e.kind === 'income'
              ? share
                ? t('yourPart', { amount: money(share, cur) })
                : ''
              : share
                ? t('yourPart', { amount: money(share, cur) })
                : t('notForYou');
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${e.title || t('noTitle')}, ${money(e.amount, cur)}, ${payerLine(e, view, me)}${right ? `, ${right}` : ''}`}
            onPress={() => router.push({ pathname: '/list/[id]/entry', params: { id: listId, entryId: e.id } })}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line },
              pressed && { opacity: 0.6 },
            ]}
          >
            {cat ? (
              <CategoryIcon icon={cat.icon} tint={e.kind === 'income' ? 'teal' : cat.tint} />
            ) : (
              <CategoryIcon icon="swap-horizontal" tint="gray" />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: th.text }}>
                {e.kind === 'transfer' ? t('repayment') : e.title || t(`cat_${categoryById(e.category).id}` as never)}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: th.sub }}>
                {payerLine(e, view, me)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: e.kind === 'income' ? th.gain : th.text }}>
                {e.kind === 'income' ? '+ ' : ''}
                {money(e.amount, cur)}
              </Text>
              {right ? <Text style={{ fontSize: 12, color: th.sub }}>{right}</Text> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function Balances({
  view,
  me,
  calc,
  refreshing,
  onRefresh,
  onPaid,
}: {
  view: ListState;
  me: string | null;
  calc: { bd: ReturnType<typeof computeBreakdown>; balances: Record<string, number>; transfers: Transfer[] };
  refreshing: boolean;
  onRefresh: () => void;
  onPaid: (tr: Transfer) => void;
}) {
  const th = useTheme();
  const cur = view.list.currency;
  const [open, setOpen] = useState<string | null>(me);
  const members = view.members.filter((m) => !m.deleted || (calc.balances[m.id] ?? 0) !== 0);
  const max = Math.max(1, ...members.map((m) => Math.abs(calc.balances[m.id] ?? 0)));
  const sorted = [...members].sort((a, b) => (calc.balances[b.id] ?? 0) - (calc.balances[a.id] ?? 0));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingTop: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.sub} />}
    >
      <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        {sorted.map((m, i) => {
          const b = calc.balances[m.id] ?? 0;
          const d = calc.bd[m.id];
          const isOpen = open === m.id;
          const width = `${Math.max(b === 0 ? 0 : 2, Math.round((Math.abs(b) / max) * 100))}%` as const;
          const label = b === 0 ? t('square') : b > 0 ? t('getsAmount', { amount: money(b, cur) }) : t('paysAmount', { amount: money(-b, cur) });
          const why = [
            t('whyPaid', { amount: money(d?.paid ?? 0, cur) }),
            t('whyShare', { amount: money(d?.share ?? 0, cur) }),
            d?.received ? t('whyReceived', { amount: money(d.received, cur) }) : '',
            d?.incomeShare ? t('whyIncomeShare', { amount: money(d.incomeShare, cur) }) : '',
            d?.sent ? t('whySent', { amount: money(d.sent, cur) }) : '',
            d?.got ? t('whyGot', { amount: money(d.got, cur) }) : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${nameOf(view, m.id, me)}: ${label}`}
              accessibilityHint={t('whyHint')}
              onPress={() => setOpen(isOpen ? null : m.id)}
              style={{ paddingVertical: 10, borderBottomWidth: i < sorted.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>{nameOf(view, m.id, me)}</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: b === 0 ? th.sub : b > 0 ? th.gain : th.owe }}>{label}</Text>
              </View>
              <View style={{ flexDirection: 'row', height: 8 }} accessible={false}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {b < 0 ? <View style={{ width, height: 8, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: th.oweBar }} /> : null}
                </View>
                <View style={{ width: 1, backgroundColor: th.border }} />
                <View style={{ flex: 1 }}>
                  {b > 0 ? <View style={{ width, height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: th.accent }} /> : null}
                </View>
              </View>
              {isOpen ? (
                <Text style={{ fontSize: 13, lineHeight: 19, color: th.sub, backgroundColor: th.bg, borderRadius: 10, padding: 10, marginTop: 8 }}>
                  {t('whyPrefix')} {why}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: th.text }}>
          {t('howSquare')}
        </Text>
        {calc.transfers.length ? (
          <Text style={{ fontSize: 13, color: th.sub }}>{t(calc.transfers.length === 1 ? 'paymentsOne' : 'paymentsMany', { n: calc.transfers.length })}</Text>
        ) : null}
      </View>
      {calc.transfers.length === 0 ? (
        <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="checkmark-circle" size={22} color={th.accent} />
          <Text style={{ fontSize: 15, color: th.text, flex: 1 }}>{t('everyoneSquare')}</Text>
        </Card>
      ) : (
        <Card style={{ paddingHorizontal: 14 }}>
          {calc.transfers.map((tr, i) => {
            const mine = tr.from === me;
            const toMe = tr.to === me;
            return (
              <View
                key={`${tr.from}-${tr.to}`}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: i < calc.transfers.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}
              >
                <Avatar name={nameOf(view, tr.from)} index={view.members.findIndex((m) => m.id === tr.from)} size={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: th.text }}>
                    <Text style={{ fontWeight: '600' }}>{nameOf(view, tr.from, me)}</Text> → {nameOf(view, tr.to, me)}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: th.text }}>{money(tr.amount, cur)}</Text>
                </View>
                {!mine ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('remindA11y', { name: nameOf(view, tr.from) })}
                    onPress={() => shareRequest(view, tr)}
                    style={[styles.smallBtn, { borderWidth: 1, borderColor: th.border, backgroundColor: th.card }]}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: th.text }}>{toMe ? t('request') : t('remind')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('markPaidA11y', { from: nameOf(view, tr.from), to: nameOf(view, tr.to), amount: money(tr.amount, cur) })}
                  onPress={() => onPaid(tr)}
                  style={[styles.smallBtn, { backgroundColor: th.accentSoft }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: th.accentText }}>{toMe ? t('received') : t('paid')}</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      <Text style={{ fontSize: 13, color: th.sub, marginTop: 10, lineHeight: 18 }}>{t('settleHint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  smallBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.field - 4, alignItems: 'center', justifyContent: 'center' },
});

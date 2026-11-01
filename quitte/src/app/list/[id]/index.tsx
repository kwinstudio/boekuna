import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { showToast } from '../../../components/Toast';
import { Avatar, Button, Card, CategoryIcon, IconButton, Screen, Segmented, TopBar } from '../../../components/ui';
import { computeBreakdown, listTransfers, nextPayer, settleProgress, totalSpent, type Transfer } from '../../../lib/balances';
import { shareReminder, type Tone } from '../../../lib/extras';
import { categoryById } from '../../../lib/categories';
import { activeMembers, money, myShare, nameOf, partyName, payerLine } from '../../../lib/domain';
import { dayLabel, numberLocale, t } from '../../../lib/i18n';
import { nowIso, todayIso, uuid } from '../../../lib/ids';
import { shareInvite, shareOverview } from '../../../lib/share';
import { parseMoney } from '../../../lib/money';
import { enqueue, updateLocal, useList } from '../../../lib/store';
import { syncList, useLiveList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';
import type { Entry, ListState } from '../../../lib/types';

type Tab = 'expenses' | 'balances';

export default function ListScreen() {
  const th = useTheme();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { local, view } = useList(id);
  const [tab, setTab] = useState<Tab>('expenses');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filterMine, setFilterMine] = useState(false);
  useLiveList(id);

  // Nieuwe lijst: meteen de uitnodiging klaarzetten (de stap waar groepen het vaakst afhaken).
  useEffect(() => {
    if (fresh !== '1' || !local || local.invitedAt) return;
    const tm = setTimeout(() => {
      updateLocal(local.id, { invitedAt: Date.now() });
      shareInvite(local.base.list.name, local.token);
    }, 600);
    return () => clearTimeout(tm);
  }, [fresh]);

  // Oude lokale verdeelsleutels delen met de hele lijst.
  useEffect(() => {
    if (!local?.splitKeys?.length || !view || (view.list.splitKeys?.length ?? 0) > 0) return;
    enqueue(local.id, { op: 'list', data: { splitKeys: local.splitKeys, updatedAt: nowIso() } });
    updateLocal(local.id, { splitKeys: [] });
    syncList(local.id);
  }, [local?.id]);

  const calc = useMemo(() => {
    if (!view) return null;
    const bd = computeBreakdown(view.entries, view.members);
    const balances = Object.fromEntries(Object.entries(bd).map(([k, v]) => [k, v.balance]));
    const order = view.members.map((m) => m.id);
    const { transfers, rep } = listTransfers(view.entries, view.members, view.list.settings);
    const active = view.members.filter((m) => !m.deleted).map((m) => m.id);
    return {
      bd,
      balances,
      transfers,
      rep,
      total: totalSpent(view.entries),
      next: view.entries.length >= 2 ? nextPayer(balances, active) : null,
      progress: settleProgress(view.entries, transfers),
    };
  }, [view]);

  // Rondjes-teller: wie gaf hoeveel rondjes, en wie is aan de beurt.
  const rounds = useMemo(() => {
    if (!view) return null;
    const rt = t('roundTitle');
    const list = view.entries.filter((e) => e.kind === 'expense' && e.category === 'drinks' && e.title === rt);
    if (!list.length) return null;
    const active = view.members.filter((m) => !m.deleted).map((m) => m.id);
    const count: Record<string, number> = Object.fromEntries(active.map((id) => [id, 0]));
    for (const e of list) for (const p of e.payers) if (p.m in count) count[p.m] += 1;
    const next = [...active].sort((a, b) => count[a] - count[b] || active.indexOf(a) - active.indexOf(b))[0];
    return { count, next };
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
  const meUnit = me ? (calc.rep.get(me) ?? me) : null;
  const myOut = calc.transfers.filter((x) => x.from === meUnit);

  const refresh = async () => {
    setRefreshing(true);
    await syncList(local.id);
    setRefreshing(false);
  };

  const markPaid = (tr: Transfer) => {
    const opts = [t('paidFull', { amount: money(tr.amount, cur) }), t('paidPart'), t('cancel')];
    const part = () =>
      Alert.prompt(
        t('paidPartTitle'),
        t('paidPartBody', { from: partyName(view, tr.from), to: partyName(view, tr.to), amount: money(tr.amount, cur) }),
        (v) => {
          const c = parseMoney(v ?? '');
          if (!c || c <= 0 || c > tr.amount) return Alert.alert(t('errPart'));
          recordPaid({ ...tr, amount: c });
        },
        'plain-text',
        '',
        'decimal-pad',
      );
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: 2 }, (i) => {
        if (i === 0) recordPaid(tr);
        if (i === 1) part();
      });
    } else recordPaid(tr);
  };

  const remind = (tr: Transfer) => {
    const tones: Tone[] = ['friendly', 'short', 'funny'];
    const opts = [t('toneFriendly'), t('toneShort'), t('toneFunny'), t('cancel')];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: 3, title: t('remindHow') }, (i) => {
        if (i < 3) shareReminder(view, tr, tones[i]);
      });
    } else shareReminder(view, tr, 'friendly');
  };

  const recordPaid = (tr: Transfer) => {
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
      summary: t('actPaid', { from: partyName(view, tr.from), to: partyName(view, tr.to), amount: money(tr.amount, cur) }),
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
      { text: t('scanReceipt'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, scan: '1' } }) },
      { text: t('kindRound'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, round: '1', payer: rounds?.next ?? me ?? undefined } }) },
      { text: t('kindIncome'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, kind: 'income' } }) },
      { text: t('kindTransfer'), onPress: () => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, kind: 'transfer' } }) },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const status =
    local.syncError === 'not_found'
      ? t('statusGone')
      : local.syncError === 'rejected'
        ? local.rejected?.length
          ? t('statusRejectedList', { items: local.rejected.join(', ') })
          : t('statusRejected')
        : local.pending.length > 0 || local.needsCreate || local.syncError === 'offline'
          ? t('statusOffline')
          : null;

  const pendingIds = new Set(local.pending.flatMap((o) => (o.op === 'entry' ? [o.data.id] : [])));
  const names = activeMembers(view).map((m) => (m.id === me ? t('you') : m.name));

  return (
    <Screen>
      <TopBar
        backLabel={t('lists')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        right={
          <>
            {tab === 'expenses' && me ? (
              <IconButton
                icon={filterMine ? 'funnel' : 'funnel-outline'}
                label={filterMine ? t('filterAll') : t('filterMine')}
                onPress={() => setFilterMine((v) => !v)}
              />
            ) : null}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 14 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, color: th.sub, flexShrink: 1 }}>
            {names.join(', ')}
          </Text>
          {status ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={status}
              onPress={() => {
                if (local.syncError === 'rejected' || local.syncError === 'not_found') Alert.alert(status);
                updateLocal(local.id, { syncError: null, rejected: [] });
                syncList(local.id);
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: th.segment }}
            >
              <Ionicons name={local.syncError === 'not_found' || local.syncError === 'rejected' ? 'warning-outline' : 'cloud-offline-outline'} size={13} color={th.sub} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: th.sub }}>
                {local.syncError === 'not_found' || local.syncError === 'rejected' ? t('statusAttention') : t('statusOfflineShort')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Card style={{ paddingHorizontal: 18, paddingVertical: 16, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: th.sub }}>
            {myBal === 0 ? t('status') : myBal > 0 ? t('youStillGet') : t('youStillPay')}
          </Text>
          <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginTop: 2, color: myBal === 0 ? th.text : myBal > 0 ? th.gain : th.owe }}>
            {myBal === 0 ? t('youreSquare') : money(Math.abs(myBal), cur)}
          </Text>
          {myBal < 0 && myOut.length === 1 ? (
            <Text style={{ fontSize: 15, color: th.text, marginTop: 2 }}>{t('toName', { name: partyName(view, myOut[0].to) })}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('together')} ${money(calc.total, cur)}. ${t('stats')}`}
            onPress={() => router.push({ pathname: '/list/[id]/stats', params: { id: local.id } })}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 12, marginBottom: -8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ fontSize: 15, color: th.sub }}>{t('togetherSpent')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: th.text }}>{money(calc.total, cur)}</Text>
              <Ionicons name="chevron-forward" size={15} color={th.sub} />
            </View>
          </Pressable>
        </Card>

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: t('tabExpenses') },
            { value: 'balances', label: t('tabBalances') },
          ]}
        />
        {filterMine && tab === 'expenses' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('filterAll')}
            onPress={() => setFilterMine(false)}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: th.accentSoft, marginTop: 10 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.accentText }}>{t('filterMineActive')}</Text>
            <Ionicons name="close" size={15} color={th.accentText} />
          </Pressable>
        ) : null}
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
        <Expenses
          view={view}
          me={me}
          query={query}
          mine={filterMine}
          next={calc.next}
          rounds={rounds}
          invited={!!local.invitedAt}
          refreshing={refreshing}
          onRefresh={refresh}
          listId={local.id}
          token={local.token}
          pendingIds={pendingIds}
        />
      ) : (
        <Balances view={view} me={me} calc={calc} refreshing={refreshing} onRefresh={refresh} onPaid={markPaid} onRemind={remind} />
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
            <IconButton icon="ellipsis-horizontal" label={t('addOther')} size={50} onPress={addOther} />
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
  mine,
  next,
  rounds,
  invited,
  refreshing,
  onRefresh,
  listId,
  token,
  pendingIds,
}: {
  pendingIds: Set<string>;
  view: ListState;
  me: string | null;
  query: string;
  mine: boolean;
  next: string | null;
  rounds: { count: Record<string, number>; next: string } | null;
  invited: boolean;
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
      if (mine && me && !e.payers.some((p) => p.m === me) && !e.shares.some((p) => p.m === me)) return false;
      if (!q) return true;
      const cat = categoryById(e.category);
      const hay = [e.title, t(`cat_${cat.id}` as never), ...e.payers.map((p) => nameOf(view, p.m)), ...e.shares.map((p) => nameOf(view, p.m))]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    // Per maand gegroepeerd, met het maandtotaal (alleen uitgaven).
    const map = new Map<string, Entry[]>();
    for (const e of filtered) map.set(e.date.slice(0, 7), [...(map.get(e.date.slice(0, 7)) ?? []), e]);
    return [...map.entries()].map(([ym, data]) => {
      const [y, m] = ym.split('-').map(Number);
      const label = monthFmt.format(new Date(y, m - 1, 1));
      const sum = data.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
      return { title: label.charAt(0).toUpperCase() + label.slice(1), total: sum, data };
    });
  }, [view, query, mine, me]);

  if (view.entries.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.sub} />}
      >
        <Card style={{ padding: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: th.text }}>{t('checklistTitle')}</Text>
          <Text style={{ fontSize: 14, color: th.sub, marginTop: 2, marginBottom: 8 }}>{t('checklistSub', { n: 1 + (invited ? 1 : 0), total: 3 })}</Text>
          <CheckRow done label={t('checkCreated')} />
          <CheckRow
            done={invited}
            label={t('checkInvite')}
            onPress={() => {
              updateLocal(listId, { invitedAt: Date.now() });
              shareInvite(view.list.name, token);
            }}
          />
          <CheckRow done={false} label={t('checkFirst')} onPress={() => router.push({ pathname: '/list/[id]/entry', params: { id: listId } })} last />
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
      ListHeaderComponent={
        // Eén slimme tip tegelijk (Hick): rondjes als die er zijn, anders wie de volgende rekening betaalt.
        !mine && !query && (rounds || next) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint={rounds ? undefined : t('nextPayerHint')}
            onPress={() =>
              router.push({ pathname: '/list/[id]/entry', params: rounds ? { id: listId, round: '1', payer: rounds.next } : { id: listId, payer: next! } })
            }
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.card, backgroundColor: th.card, marginTop: 12 }, pressed && { opacity: 0.7 }]}
          >
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={rounds ? 'beer-outline' : 'repeat-outline'} size={17} color={th.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: th.text }}>
                {rounds
                  ? rounds.next === me
                    ? t('roundNextYou')
                    : t('roundNext', { name: nameOf(view, rounds.next) })
                  : next === me
                    ? t('nextPayerYou')
                    : t('nextPayer', { name: nameOf(view, next!) })}
              </Text>
              {rounds ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: th.sub, marginTop: 1 }}>
                  {Object.entries(rounds.count)
                    .map(([id, n]) => `${nameOf(view, id, me)} ${n}`)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
            <Ionicons name={rounds ? 'add' : 'chevron-forward'} size={18} color={th.sub} />
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={<Text style={{ color: th.sub, textAlign: 'center', marginTop: 24 }}>{t('noResults')}</Text>}
      renderSectionHeader={({ section }) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 13, fontWeight: '600', color: th.sub }}>{section.title}</Text>
          {section.total ? <Text style={{ fontSize: 13, color: th.sub }}>{money(section.total, cur)}</Text> : null}
        </View>
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
                {payerLine(e, view, me)} · {shortDay(e.date)}
              </Text>
              {e.repeat || e.photos?.length || (view.comments ?? []).some((c) => c.entryId === e.id) ? (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                  {e.repeat ? <Ionicons name="repeat" size={13} color={th.sub} accessibilityLabel={t('repeat')} /> : null}
                  {e.photos?.length ? <Ionicons name="image-outline" size={13} color={th.sub} accessibilityLabel={t('photo')} /> : null}
                  {(view.comments ?? []).some((c) => c.entryId === e.id) ? <Ionicons name="chatbubble-outline" size={12} color={th.sub} accessibilityLabel={t('comments')} /> : null}
                </View>
              ) : null}
              {pendingIds.has(e.id) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={t('notSentYet')}>
                  <Ionicons name="cloud-upload-outline" size={12} color={th.sub} />
                  <Text style={{ fontSize: 12, color: th.sub }}>{t('notSentYet')}</Text>
                </View>
              ) : null}
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
  onRemind,
}: {
  view: ListState;
  me: string | null;
  calc: { bd: ReturnType<typeof computeBreakdown>; balances: Record<string, number>; transfers: Transfer[]; rep: Map<string, string>; progress: { paid: number; remaining: number; total: number } };
  refreshing: boolean;
  onRefresh: () => void;
  onPaid: (tr: Transfer) => void;
  onRemind: (tr: Transfer) => void;
}) {
  const th = useTheme();
  const cur = view.list.currency;
  const [open, setOpen] = useState<string | null>(me);
  const meUnit = me ? (calc.rep.get(me) ?? me) : null;

  // Gratis betalen: IBAN en bedrag in één tik kopiëren (geen servicekosten zoals bij betalen via een app).
  const payTarget = (unit: string) => {
    const ids = [unit, ...[...calc.rep.entries()].filter(([, r]) => r === unit).map(([id]) => id)];
    return ids.map((id) => view.members.find((x) => x.id === id)).find((x) => x?.iban || x?.payLink) ?? null;
  };
  const pay = (tr: Transfer) => {
    const m = payTarget(tr.to);
    if (!m) return;
    const amountText = (tr.amount / 100).toFixed(2).replace('.', ',');
    const copy = async (v: string, msg: string) => {
      await Clipboard.setStringAsync(v);
      showToast(msg);
    };
    const opts: { text: string; onPress: () => void }[] = [];
    if (m.payLink) opts.push({ text: t('openPayLink'), onPress: () => Linking.openURL(m.payLink!).catch(() => {}) });
    if (m.iban) {
      opts.push({ text: t('copyIbanAmount'), onPress: () => copy(`${m.iban}\n${m.name}\n${amountText}\n${view.list.name}`, t('copiedAll')) });
      opts.push({ text: t('copyIban', { iban: m.iban }), onPress: () => copy(m.iban!.replace(/\s/g, ''), t('ibanCopied')) });
      opts.push({ text: t('copyAmount', { amount: money(tr.amount, cur) }), onPress: () => copy(amountText, t('amountCopied')) });
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...opts.map((o) => o.text), t('cancel')], cancelButtonIndex: opts.length, title: t('payTitle', { name: m.name, amount: money(tr.amount, cur) }), message: t('payNoFees') },
        (i) => opts[i]?.onPress(),
      );
    } else Alert.alert(t('payTitle', { name: m.name, amount: money(tr.amount, cur) }), t('payNoFees'), [...opts, { text: t('cancel'), style: 'cancel' }]);
  };
  const members = view.members.filter((m) => !m.deleted || (calc.balances[m.id] ?? 0) !== 0);
  const max = Math.max(1, ...members.map((m) => Math.abs(calc.balances[m.id] ?? 0)));
  const sorted = [...members].sort((a, b) => (calc.balances[b.id] ?? 0) - (calc.balances[a.id] ?? 0));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingTop: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={th.sub} />}
    >
      {calc.progress.paid > 0 ? (
        <Card style={{ padding: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.text }}>
              {calc.progress.remaining === 0 ? t('progressDone') : t('progressLabel', { pct: Math.round((calc.progress.paid / calc.progress.total) * 100) })}
            </Text>
            <Text style={{ fontSize: 13, color: th.sub }}>
              {money(calc.progress.paid, cur)} / {money(calc.progress.total, cur)}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: th.segment, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((calc.progress.paid / Math.max(1, calc.progress.total)) * 100)}%`, height: 6, backgroundColor: th.gain }} />
          </View>
        </Card>
      ) : null}
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
              <View style={{ flexDirection: 'row', height: 6 }} accessible={false}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {b < 0 ? <View style={{ width, height: 6, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, backgroundColor: th.oweBar }} /> : null}
                </View>
                <View style={{ width: 1, backgroundColor: th.border }} />
                <View style={{ flex: 1 }}>
                  {b > 0 ? <View style={{ width, height: 6, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: th.accent }} /> : null}
                </View>
              </View>
              {isOpen ? (
                <View style={{ backgroundColor: th.bg, borderRadius: 10, padding: 10, marginTop: 8 }}>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: th.sub }}>
                    {t('whyPrefix')} {why}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push({ pathname: '/list/[id]/person', params: { id: view.list.id, m: m.id } })}
                    style={{ minHeight: 36, justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: th.accent }}>{t('seeAllItems')} →</Text>
                  </Pressable>
                </View>
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
            const mine = tr.from === meUnit;
            const toMe = tr.to === meUnit;
            return (
              <View
                key={`${tr.from}-${tr.to}`}
                style={{ paddingVertical: 14, gap: 10, borderBottomWidth: i < calc.transfers.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 16, color: th.text }}>
                    <Text style={{ fontWeight: '600' }}>{partyName(view, tr.from, me)}</Text>
                    <Text style={{ color: th.sub }}>  →  </Text>
                    <Text style={{ fontWeight: '600' }}>{partyName(view, tr.to, me)}</Text>
                  </Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: mine ? th.owe : toMe ? th.gain : th.text }}>{money(tr.amount, cur)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {mine && payTarget(tr.to) ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('payA11y', { name: partyName(view, tr.to), amount: money(tr.amount, cur) })}
                      onPress={() => pay(tr)}
                      style={({ pressed }) => [styles.smallBtn, { flex: 1, borderWidth: 1, borderColor: th.border, backgroundColor: th.card }, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '600', color: th.text }}>{t('pay')}</Text>
                    </Pressable>
                  ) : null}
                  {!mine ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('remindA11y', { name: partyName(view, tr.from) })}
                      onPress={() => onRemind(tr)}
                      style={({ pressed }) => [styles.smallBtn, { flex: 1, borderWidth: 1, borderColor: th.border, backgroundColor: th.card }, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '600', color: th.text }}>{toMe ? t('request') : t('remind')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('markPaidA11y', { from: partyName(view, tr.from), to: partyName(view, tr.to), amount: money(tr.amount, cur) })}
                    onPress={() => onPaid(tr)}
                    style={({ pressed }) => [styles.smallBtn, { flex: 1, backgroundColor: th.accentSoft }, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: th.accentText }}>{toMe ? t('received') : t('paid')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Card>
      )}
      <Text style={{ fontSize: 13, color: th.sub, marginTop: 10, lineHeight: 18 }}>
        {view.list.settings?.directDebts ? t('settleHintDirect') : t('settleHint')}
      </Text>
    </ScrollView>
  );
}

const monthFmt = new Intl.DateTimeFormat(numberLocale, { month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat(numberLocale, { day: 'numeric', month: 'short' });
function shortDay(iso: string) {
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  const p = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (iso === p(today)) return t('today').toLowerCase();
  if (iso === p(y)) return t('yesterday').toLowerCase();
  const [a, b, c] = iso.split('-').map(Number);
  return shortFmt.format(new Date(a, b - 1, c)).replace('.', '');
}

function CheckRow({ done, label, onPress, last }: { done: boolean; label: string; onPress?: () => void; last?: boolean }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: done, disabled: !onPress || done }}
      disabled={!onPress || done}
      onPress={onPress}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: th.line }}
    >
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={done ? th.gain : th.border} />
      <Text style={{ flex: 1, fontSize: 16, color: done ? th.sub : th.text, textDecorationLine: done ? 'line-through' : 'none' }}>{label}</Text>
      {!done && onPress ? <Ionicons name="chevron-forward" size={16} color={th.sub} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  smallBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.field - 4, alignItems: 'center', justifyContent: 'center' },
});

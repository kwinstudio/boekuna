import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Keypad } from '../../../components/Keypad';
import { showToast } from '../../../components/Toast';
import { Avatar, Button, Card, CategoryIcon, Segmented, TopBar } from '../../../components/ui';
import { CATEGORIES, categoryById, guessCategory } from '../../../lib/categories';
import { activeMembers, money, nameOf } from '../../../lib/domain';
import { dayLabel, isoDay, t } from '../../../lib/i18n';
import { nowIso, todayIso, uuid } from '../../../lib/ids';
import { CURRENCIES, centsToInput, keypadInput, parseMoney } from '../../../lib/money';
import { duplicateEntry, fetchRate, moveEntry, pickPhoto, uploadPhoto, usePhotoUrls } from '../../../lib/extras';
import { splitEqual, splitShares, sumParts } from '../../../lib/split';
import { enqueue, getState, updateLocal, useList } from '../../../lib/store';
import { syncList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';
import type { Entry, Kind, ListState, Part, Repeat, SplitKey, SplitMode } from '../../../lib/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Sheet = null | 'payer' | 'split' | 'date' | 'category' | 'to' | 'more' | 'comments';

const EMOJI = ['👍', '❤️', '😂', '🙏', '😮'];

function nextDate(iso: string, r: Repeat) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (r === 'weekly') dt.setDate(dt.getDate() + 7);
  else dt.setMonth(dt.getMonth() + 1);
  return isoDay(dt);
}

export default function EntryScreen() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; entryId?: string; kind?: Kind; payer?: string }>();
  const { local, view } = useList(params.id);
  const existing = view?.entries.find((e) => e.id === params.entryId);
  const me = local?.me ?? null;
  const members = view ? activeMembers(view) : [];
  const order = members.map((m) => m.id);
  const listKeys: SplitKey[] = view?.list.splitKeys ?? local?.splitKeys ?? [];
  const defKey = !existing ? listKeys.find((k) => k.id === view?.list.settings?.defaultSplit) : undefined;
  const [entryId] = useState(existing?.id ?? uuid());

  const [kind] = useState<Kind>(existing?.kind ?? params.kind ?? 'expense');
  const [amountStr, setAmountStr] = useState(existing ? centsToInput(existing.origAmount ?? existing.amount) : '');
  const [fx, setFx] = useState<string | null>(existing?.origCurrency ?? null);
  const [rate, setRate] = useState<number | null>(existing?.rate ?? null);
  const [rateStr, setRateStr] = useState(existing?.rate ? String(existing.rate).replace('.', ',') : '');
  const [rateBusy, setRateBusy] = useState(false);
  const [repeat, setRepeat] = useState<Repeat | null>(existing?.repeat ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [comment, setComment] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [catManual, setCatManual] = useState(!!existing?.category);
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const remembered = local?.lastPayer && order.includes(local.lastPayer) ? local.lastPayer : null;
  const firstPayer = existing?.payers[0]?.m ?? (params.payer && order.includes(params.payer) ? params.payer : null) ?? remembered ?? me ?? order[0];
  const [multiPay, setMultiPay] = useState((existing?.payers.length ?? 1) > 1);
  const [payer, setPayer] = useState<string>(firstPayer);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>(
    Object.fromEntries((existing?.payers ?? []).map((p) => [p.m, centsToInput(p.a)])),
  );
  const [toId, setToId] = useState<string>(
    existing?.kind === 'transfer' ? existing.shares[0]?.m : (order.find((x) => x !== firstPayer) ?? order[0]),
  );
  const [mode, setMode] = useState<SplitMode>(existing?.splitMode ?? (defKey ? 'shares' : 'equal'));
  const [included, setIncluded] = useState<string[]>(existing ? existing.shares.map((p) => p.m) : order);
  const [weights, setWeights] = useState<Record<string, number>>(
    existing?.weights ?? (defKey ? { ...Object.fromEntries(order.map((id) => [id, 0])), ...defKey.weights } : Object.fromEntries(order.map((id) => [id, 1]))),
  );
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>(
    existing?.splitMode === 'amounts' ? Object.fromEntries(existing.shares.map((p) => [p.m, centsToInput(p.a)])) : {},
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState('');

  const typed = parseMoney(amountStr) ?? 0;
  const listCur = view?.list.currency ?? 'EUR';
  const foreign = !!fx && fx !== listCur;
  const amount = foreign ? (rate ? Math.round(typed * rate) : 0) : typed;
  const photoUrls = usePhotoUrls(local?.token, photos);

  useEffect(() => {
    if (!foreign || !fx || existing?.origCurrency === fx) return;
    let off = false;
    setRateBusy(true);
    fetchRate(fx, listCur).then((r) => {
      if (off) return;
      setRateBusy(false);
      if (r) {
        setRate(r);
        setRateStr(String(Math.round(r * 10000) / 10000).replace('.', ','));
      }
    });
    return () => {
      off = true;
    };
  }, [fx]);

  const payers: Part[] = useMemo(() => {
    if (!multiPay) return [{ m: payer, a: amount }];
    return order.map((m) => ({ m, a: parseMoney(payAmounts[m] ?? '') ?? 0 })).filter((p) => p.a > 0);
  }, [multiPay, payer, amount, payAmounts, order.join()]);

  const shares: Part[] = useMemo(() => {
    if (kind === 'transfer') return [{ m: toId, a: amount }];
    const inc = order.filter((id) => included.includes(id));
    if (mode === 'equal') return splitEqual(amount, inc);
    if (mode === 'shares') return splitShares(amount, weights, order);
    return order.map((m) => ({ m, a: parseMoney(splitAmounts[m] ?? '') ?? 0 })).filter((p) => p.a > 0);
  }, [kind, toId, amount, mode, included, weights, splitAmounts, order.join()]);

  if (!local || !view) return null;
  const cur = view.list.currency;
  const compact = height < 740;

  const payerSum = sumParts(payers);
  const shareSum = sumParts(shares);

  const save = () => {
    if (foreign && !rate) return setError(t('errRate'));
    if (amount <= 0) return setError(t('errAmount'));
    if (uploading) return;
    if (multiPay && payerSum !== amount) return setError(t('errPayers', { diff: money(amount - payerSum, cur) }));
    if (shares.length === 0) return setError(t('errNobody'));
    if (shareSum !== amount) return setError(t('errSplit', { diff: money(amount - shareSum, cur) }));
    if (kind === 'transfer' && payers[0]?.m === toId) return setError(t('errSelf'));
    const finalCat = kind === 'transfer' ? null : category ?? guessCategory(title);
    const entry: Entry = {
      id: entryId,
      kind,
      title: title.trim().slice(0, 120),
      amount,
      category: finalCat,
      date,
      payers,
      shares,
      splitMode: kind === 'transfer' ? 'amounts' : mode,
      weights: kind !== 'transfer' && mode === 'shares' ? weights : null,
      batchId: existing?.batchId ?? null,
      createdBy: existing?.createdBy ?? me,
      createdAt: existing?.createdAt,
      updatedAt: nowIso(),
      updatedBy: me,
      note: note.trim().slice(0, 500) || null,
      photos,
      origCurrency: foreign ? fx : null,
      origAmount: foreign ? typed : null,
      rate: foreign ? rate : null,
      repeat: kind === 'transfer' ? null : repeat,
      repeatNext: kind !== 'transfer' && repeat ? (existing?.repeat === repeat && existing.repeatNext ? existing.repeatNext : nextDate(date, repeat)) : null,
    };
    const label = entry.title || (kind === 'transfer' ? t('repayment') : t(`cat_${categoryById(finalCat).id}` as never));
    enqueue(local.id, {
      op: 'entry',
      data: entry,
      summary: t(existing ? 'actEdited' : 'actAdded', { title: label, amount: money(amount, cur) }),
    });
    if (!multiPay && kind === 'expense') updateLocal(local.id, { lastPayer: payer });
    syncList(local.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  const saveKeys = (keys: SplitKey[], summary?: string) => {
    enqueue(local.id, { op: 'list', data: { splitKeys: keys, updatedAt: nowIso() }, summary });
    syncList(local.id);
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    if (local.needsCreate) return showToast(t('photoOffline'));
    try {
      const uri = await pickPhoto(source);
      if (!uri) return;
      setUploading(true);
      const path = await uploadPhoto(local.token, entryId, uri);
      setPhotos((p) => [...p, path]);
    } catch {
      showToast(t('photoFailed'));
    } finally {
      setUploading(false);
    }
  };

  const choosePhoto = () => {
    const opts = [t('takePhoto'), t('fromLibrary'), t('cancel')];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: 2 }, (i) => {
        if (i === 0) addPhoto('camera');
        if (i === 1) addPhoto('library');
      });
    } else {
      Alert.alert(t('addPhoto'), undefined, [
        { text: opts[0], onPress: () => addPhoto('camera') },
        { text: opts[1], onPress: () => addPhoto('library') },
        { text: opts[2], style: 'cancel' },
      ]);
    }
  };

  const comments = (view.comments ?? []).filter((c) => c.entryId === entryId);
  const sendComment = (body: string | null, emoji: string | null) => {
    if (!existing) return;
    if (!body && !emoji) return;
    enqueue(local.id, {
      op: 'comment',
      data: { id: uuid(), entryId, memberId: me, body, emoji, at: nowIso(), updatedAt: nowIso() },
      summary: body ? t('actCommented', { title: existing.title || t('noTitle') }) : undefined,
    });
    syncList(local.id);
    setComment('');
  };

  const others = Object.values(getState().lists).filter((l) => l.id !== local.id && !l.base.list.archived);
  const moreMenu = () => {
    if (!existing) return;
    const doMove = () => {
      if (!others.length) return Alert.alert(t('noOtherLists'));
      Alert.alert(t('moveTo'), t('moveBody'), [
        ...others.slice(0, 6).map((l) => ({
          text: l.base.list.name,
          onPress: () => {
            if (moveEntry(local.id, l.id, existing)) {
              router.back();
              showToast(t('movedTo', { name: l.base.list.name }));
            }
          },
        })),
        { text: t('cancel'), style: 'cancel' as const },
      ]);
    };
    const doDup = () => {
      duplicateEntry(local.id, existing, me);
      router.back();
      showToast(t('duplicated'));
    };
    const opts = [t('duplicate'), t('moveToList'), t('delete'), t('cancel')];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, destructiveButtonIndex: 2, cancelButtonIndex: 3 }, (i) => {
        if (i === 0) doDup();
        if (i === 1) doMove();
        if (i === 2) remove();
      });
    } else {
      Alert.alert(t('more'), undefined, [
        { text: opts[0], onPress: doDup },
        { text: opts[1], onPress: doMove },
        { text: opts[2], style: 'destructive', onPress: remove },
        { text: opts[3], style: 'cancel' },
      ]);
    }
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert(t('deleteTitle'), t('deleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          const label = existing.title || t('repayment');
          enqueue(local.id, {
            op: 'entry',
            data: { ...existing, deleted: true, updatedAt: nowIso() },
            summary: t('actDeleted', { title: label, amount: money(existing.amount, cur) }),
          });
          syncList(local.id);
          router.back();
          showToast(t('deleted'), t('undo'), () => {
            enqueue(local.id, { op: 'entry', data: { ...existing, deleted: false, updatedAt: nowIso() }, summary: t('actRestored', { title: label }) });
            syncList(local.id);
          });
        },
      },
    ]);
  };

  const heading = existing
    ? t('editTitle')
    : kind === 'income'
      ? t('newIncome')
      : kind === 'transfer'
        ? t('newTransfer')
        : t('newExpense');

  const cat = categoryById(category ?? guessCategory(title));
  const payerLabel = multiPay ? t('multiplePayers', { n: payers.length }) : nameOf(view, payer, me);
  const allIncluded = order.every((id) => included.includes(id));
  const splitLabel =
    mode === 'equal'
      ? allIncluded
        ? t('everyoneEqual')
        : t('someEqual', { n: included.length })
      : mode === 'shares'
        ? t('byShares')
        : t('byAmounts');

  const extraParts = [
    foreign ? fx! : null,
    repeat ? t(repeat === 'weekly' ? 'repeatWeekly' : 'repeatMonthly') : null,
    photos.length ? t(photos.length === 1 ? 'photosOne' : 'photosMany', { n: photos.length }) : null,
    note.trim() ? t('note') : null,
  ].filter(Boolean);
  const extraLabel = extraParts.length ? extraParts.join(' · ') : t('extraHint');

  const perPerson = mode === 'equal' && included.length > 0 && amount > 0 ? Math.floor(amount / included.length) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) }}>
      <TopBar
        backLabel={t('cancel')}
        title={heading}
        right={existing ? <IconBtn icon="ellipsis-horizontal-circle-outline" label={t('more')} onPress={moreMenu} color={th.accent} /> : null}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <Text
          accessibilityRole="text"
          accessibilityLabel={t('amountA11y', { amount: money(foreign ? typed : amount, fx ?? cur) })}
          style={{ textAlign: 'center', fontSize: compact ? 44 : 52, fontWeight: '700', letterSpacing: -1.5, color: amount ? th.text : th.sub, paddingVertical: compact ? 6 : 12 }}
        >
          {money(typed, foreign ? fx! : cur).replace(/[\d.,]+/, amountStr ? amountStr : '0')}
        </Text>
        {foreign ? (
          <Text style={{ textAlign: 'center', fontSize: 14, color: th.sub, marginTop: -6, marginBottom: 8 }}>
            {rateBusy ? t('fetchingRate') : rate ? t('convertedTo', { amount: money(amount, cur) }) : t('errRate')}
          </Text>
        ) : null}

        {kind !== 'transfer' ? (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <TextInput
              accessibilityLabel={t('description')}
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setError('');
                if (!catManual) setCategory(guessCategory(v));
              }}
              placeholder={kind === 'income' ? t('incomePlaceholder') : t('titlePlaceholder')}
              placeholderTextColor={th.sub}
              maxLength={120}
              returnKeyType="done"
              style={{ flex: 1, height: 50, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 17, color: th.text }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('categoryA11y', { name: t(`cat_${cat.id}` as never) })}
              onPress={() => setSheet('category')}
              style={{ height: 50, minWidth: 50, borderRadius: radius.field, backgroundColor: th.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }}
            >
              <CategoryIcon icon={cat.icon} tint={cat.tint} size={32} />
            </Pressable>
          </View>
        ) : null}

        <Card style={{ overflow: 'hidden', marginBottom: 8 }}>
          <SummaryRow
            label={kind === 'transfer' ? t('from') : kind === 'income' ? t('receivedBy') : t('paidBy')}
            value={payerLabel}
            onPress={() => setSheet('payer')}
          />
          {kind === 'transfer' ? (
            <SummaryRow label={t('to')} value={nameOf(view, toId, me)} onPress={() => setSheet('to')} />
          ) : (
            <SummaryRow label={kind === 'income' ? t('forWhom') : t('splitOver')} value={splitLabel} onPress={() => setSheet('split')} />
          )}
          <SummaryRow label={t('date')} value={dayLabel(date)} onPress={() => setSheet('date')} />
          <SummaryRow label={t('extra')} value={extraLabel} onPress={() => setSheet('more')} last={!existing} />
          {existing ? (
            <SummaryRow label={t('comments')} value={comments.length ? String(comments.length) : t('none')} onPress={() => setSheet('comments')} last />
          ) : null}
        </Card>
        {existing?.updatedBy && existing.updatedBy !== existing.createdBy ? (
          <Text style={{ textAlign: 'center', fontSize: 13, color: th.sub, marginBottom: 6 }}>
            {t('changedBy', { name: nameOf(view, existing.updatedBy, me) })}
          </Text>
        ) : null}
        {perPerson > 0 && kind !== 'transfer' ? (
          <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '600', color: th.accentText, marginBottom: 6 }}>
            {t('perPerson', { amount: money(perPerson, cur), n: included.length })}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityLiveRegion="polite" style={{ textAlign: 'center', fontSize: 14, color: th.danger, marginBottom: 6 }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Keypad
          compact={compact}
          onKey={(k) => {
            setAmountStr((s) => keypadInput(s, k));
            setError('');
          }}
        />
        <Button label={t('save')} onPress={save} />
      </View>

      {/* Wie betaalde */}
      <SheetModal visible={sheet === 'payer'} title={kind === 'income' ? t('receivedBy') : kind === 'transfer' ? t('from') : t('paidBy')} onClose={() => setSheet(null)}>
        {kind === 'expense' ? (
          <Segmented
            value={multiPay ? 'multi' : 'single'}
            onChange={(v) => setMultiPay(v === 'multi')}
            options={[
              { value: 'single', label: t('onePerson') },
              { value: 'multi', label: t('multiplePeople') },
            ]}
          />
        ) : null}
        <Card style={{ marginTop: 14 }}>
          {members.map((m, i) =>
            multiPay ? (
              <AmountRow
                key={m.id}
                view={view}
                id={m.id}
                index={i}
                me={me}
                value={payAmounts[m.id] ?? ''}
                onChange={(v) => setPayAmounts((s) => ({ ...s, [m.id]: v }))}
                last={i === members.length - 1}
              />
            ) : (
              <ChoiceRow
                key={m.id}
                name={nameOf(view, m.id, me)}
                index={i}
                selected={payer === m.id}
                onPress={() => {
                  setPayer(m.id);
                  setSheet(null);
                }}
                last={i === members.length - 1}
              />
            ),
          )}
        </Card>
        {multiPay ? <Progress done={payerSum} total={amount} currency={cur} /> : null}
      </SheetModal>

      {/* Aan wie (terugbetaling) */}
      <SheetModal visible={sheet === 'to'} title={t('to')} onClose={() => setSheet(null)}>
        <Card>
          {members.map((m, i) => (
            <ChoiceRow
              key={m.id}
              name={nameOf(view, m.id, me)}
              index={i}
              selected={toId === m.id}
              onPress={() => {
                setToId(m.id);
                setSheet(null);
              }}
              last={i === members.length - 1}
            />
          ))}
        </Card>
      </SheetModal>

      {/* Verdelen */}
      <SheetModal visible={sheet === 'split'} title={t('splitTitle')} subtitle={money(amount, cur)} onClose={() => setSheet(null)} doneDisabled={shareSum !== amount && amount > 0}>
        <Segmented<SplitMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'equal', label: t('modeEqual') },
            { value: 'amounts', label: t('modeAmounts') },
            { value: 'shares', label: t('modeShares') },
          ]}
        />
        {mode === 'shares' && listKeys.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            {listKeys.map((k) => (
              <Pressable
                key={k.id}
                accessibilityRole="button"
                accessibilityLabel={t('useKey', { name: k.name })}
                onPress={() => setWeights({ ...Object.fromEntries(order.map((id) => [id, 0])), ...k.weights })}
                onLongPress={() =>
                  Alert.alert(k.name, undefined, [
                    view.list.settings?.defaultSplit === k.id
                      ? { text: t('unsetDefaultKey'), onPress: () => { enqueue(local.id, { op: 'settings', data: { settings: { defaultSplit: null }, updatedAt: nowIso() } }); syncList(local.id); } }
                      : { text: t('setDefaultKey'), onPress: () => { enqueue(local.id, { op: 'settings', data: { settings: { defaultSplit: k.id }, updatedAt: nowIso() }, summary: t('actDefaultKey', { name: k.name }) }); syncList(local.id); showToast(t('defaultKeySet')); } },
                    { text: t('delete'), style: 'destructive', onPress: () => saveKeys(listKeys.filter((x) => x.id !== k.id)) },
                    { text: t('cancel'), style: 'cancel' },
                  ])
                }
                style={{ height: 36, paddingHorizontal: 14, borderRadius: 12, backgroundColor: th.accentSoft, justifyContent: 'center' }}
              >
                <Text style={{ color: th.accentText, fontWeight: '600', fontSize: 14 }}>{view.list.settings?.defaultSplit === k.id ? '★ ' : ''}{k.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Card style={{ marginTop: 14 }}>
          {members.map((m, i) => {
            const part = shares.find((p) => p.m === m.id)?.a ?? 0;
            if (mode === 'amounts') {
              return (
                <AmountRow
                  key={m.id}
                  view={view}
                  id={m.id}
                  index={i}
                  me={me}
                  value={splitAmounts[m.id] ?? ''}
                  onChange={(v) => setSplitAmounts((s) => ({ ...s, [m.id]: v }))}
                  last={i === members.length - 1}
                />
              );
            }
            if (mode === 'shares') {
              const w = weights[m.id] ?? 0;
              return (
                <View key={m.id} style={[styles.row, i < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}>
                  <Avatar name={m.name} index={i} dim={w === 0} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: w ? th.text : th.sub }}>{nameOf(view, m.id, me)}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: w ? th.accentText : th.sub }}>{w ? money(part, cur) : t('notJoining')}</Text>
                  </View>
                  <Stepper
                    value={w}
                    name={nameOf(view, m.id, me)}
                    onChange={(v) => setWeights((s) => ({ ...s, [m.id]: v }))}
                  />
                </View>
              );
            }
            const on = included.includes(m.id);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setIncluded((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                style={[styles.row, i < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}
              >
                <Avatar name={m.name} index={i} dim={!on} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: on ? th.text : th.sub }}>{nameOf(view, m.id, me)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? th.accentText : th.sub }}>{on ? money(part, cur) : t('notJoining')}</Text>
                </View>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? th.accent : th.border} />
              </Pressable>
            );
          })}
        </Card>
        <Progress done={shareSum} total={amount} currency={cur} />
        {mode === 'shares' ? (
          <Button
            kind="ghost"
            icon="bookmark-outline"
            label={t('saveKey')}
            onPress={() => {
              const nm = order.filter((id) => (weights[id] ?? 0) > 0).map((id) => `${nameOf(view, id)} ${weights[id]}`).join(' · ');
              saveKeys([...listKeys, { id: uuid(), name: nm.slice(0, 40), weights: { ...weights } }].slice(-30), t('actKeySaved'));
              showToast(t('keySaved'));
            }}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </SheetModal>

      {/* Datum */}
      <SheetModal visible={sheet === 'date'} title={t('date')} onClose={() => setSheet(null)}>
        <Card>
          {Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const iso = isoDay(d);
            return (
              <ChoiceRow
                key={iso}
                name={dayLabel(iso)}
                selected={date === iso}
                onPress={() => {
                  setDate(iso);
                  setSheet(null);
                }}
                last={i === 29}
              />
            );
          })}
        </Card>
      </SheetModal>

      {/* Extra: valuta, herhalen, notitie, foto's */}
      <SheetModal visible={sheet === 'more'} title={t('extra')} onClose={() => setSheet(null)}>
        {kind !== 'transfer' ? (
          <Card style={{ overflow: 'hidden' }}>
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, paddingHorizontal: 14, marginBottom: 8 }}>{t('currency')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
                {[cur, ...CURRENCIES.filter((c) => c !== cur)].map((c) => {
                  const sel = (fx ?? cur) === c;
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: sel }}
                      onPress={() => {
                        setFx(c === cur ? null : c);
                        if (c !== cur && c !== fx) setRate(null);
                      }}
                      style={{ height: 36, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', backgroundColor: sel ? th.accent : th.segment }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? '#fff' : th.text }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            {foreign ? (
              <View style={[styles.row, { minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: th.line }]}>
                <Text style={{ flex: 1, fontSize: 16, color: th.sub }}>{t('rateLabel', { from: fx!, to: cur })}</Text>
                <TextInput
                  accessibilityLabel={t('rateLabel', { from: fx!, to: cur })}
                  value={rateStr}
                  onChangeText={(v) => {
                    const clean = v.replace(/[^\d.,]/g, '');
                    setRateStr(clean);
                    const n = Number(clean.replace(',', '.'));
                    setRate(n > 0 ? n : null);
                  }}
                  keyboardType="decimal-pad"
                  style={{ width: 110, height: 44, borderRadius: 10, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 12, fontSize: 16, color: th.text, textAlign: 'right' }}
                />
              </View>
            ) : null}
          </Card>
        ) : null}
        {kind !== 'transfer' ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, marginTop: 18, marginBottom: 8 }}>{t('repeat')}</Text>
            <Segmented<'none' | Repeat>
              value={repeat ?? 'none'}
              onChange={(v) => setRepeat(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: t('repeatNever') },
                { value: 'weekly', label: t('repeatWeekly') },
                { value: 'monthly', label: t('repeatMonthly') },
              ]}
            />
            {repeat ? <Text style={{ fontSize: 13, color: th.sub, marginTop: 8 }}>{t('repeatHint', { date: dayLabel(nextDate(date, repeat)) })}</Text> : null}
          </>
        ) : null}
        <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, marginTop: 18, marginBottom: 8 }}>{t('note')}</Text>
        <TextInput
          accessibilityLabel={t('note')}
          value={note}
          onChangeText={setNote}
          placeholder={t('notePlaceholder')}
          placeholderTextColor={th.sub}
          multiline
          maxLength={500}
          style={{ minHeight: 80, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, padding: 14, fontSize: 16, color: th.text, textAlignVertical: 'top' }}
        />
        <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, marginTop: 18, marginBottom: 8 }}>{t('receipt')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {photos.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('photo')}
              onLongPress={() =>
                Alert.alert(t('removePhoto'), undefined, [
                  { text: t('cancel'), style: 'cancel' },
                  { text: t('remove'), style: 'destructive', onPress: () => setPhotos((s) => s.filter((x) => x !== p)) },
                ])
              }
              onPress={() => photoUrls[p] && setViewer(photoUrls[p])}
              style={{ width: 88, height: 88, borderRadius: 10, overflow: 'hidden', backgroundColor: th.card }}
            >
              {photoUrls[p] ? <Image source={{ uri: photoUrls[p] }} style={{ width: 88, height: 88 }} contentFit="cover" /> : <ActivityIndicator style={{ flex: 1 }} />}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('addPhoto')}
            onPress={choosePhoto}
            disabled={uploading || photos.length >= 6}
            style={{ width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: th.border, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: photos.length >= 6 ? 0.4 : 1 }}
          >
            {uploading ? <ActivityIndicator /> : <Ionicons name="camera-outline" size={24} color={th.accent} />}
            <Text style={{ fontSize: 12, color: th.sub }}>{t('addPhoto')}</Text>
          </Pressable>
        </View>
      </SheetModal>

      {/* Reacties */}
      <SheetModal visible={sheet === 'comments'} title={t('comments')} onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {EMOJI.map((e) => {
            const n = comments.filter((c) => c.emoji === e).length;
            return (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityLabel={t('react', { emoji: e })}
                onPress={() => {
                  const mine = comments.find((c) => c.emoji === e && c.memberId === me);
                  if (mine) {
                    enqueue(local.id, { op: 'comment', data: { ...mine, deleted: true, updatedAt: nowIso() } });
                    syncList(local.id);
                  } else sendComment(null, e);
                }}
                style={{ minWidth: 52, height: 40, borderRadius: 20, backgroundColor: th.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10 }}
              >
                <Text style={{ fontSize: 18 }}>{e}</Text>
                {n ? <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub }}>{n}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {comments.filter((c) => c.body).length ? (
          <Card style={{ paddingHorizontal: 14 }}>
            {comments
              .filter((c) => c.body)
              .map((c, i, arr) => (
                <Pressable
                  key={c.id}
                  onLongPress={() =>
                    c.memberId === me &&
                    Alert.alert(t('deleteComment'), undefined, [
                      { text: t('cancel'), style: 'cancel' },
                      { text: t('delete'), style: 'destructive', onPress: () => { enqueue(local.id, { op: 'comment', data: { ...c, deleted: true, updatedAt: nowIso() } }); syncList(local.id); } },
                    ])
                  }
                  style={{ paddingVertical: 10, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub }}>
                    {c.memberId ? nameOf(view, c.memberId, me) : '?'} · {dayLabel(c.at.slice(0, 10))}
                  </Text>
                  <Text style={{ fontSize: 16, color: th.text, marginTop: 2 }}>{c.body}</Text>
                </Pressable>
              ))}
          </Card>
        ) : (
          <Text style={{ fontSize: 15, color: th.sub }}>{t('noComments')}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <TextInput
            accessibilityLabel={t('writeComment')}
            value={comment}
            onChangeText={setComment}
            placeholder={t('writeComment')}
            placeholderTextColor={th.sub}
            maxLength={500}
            onSubmitEditing={() => sendComment(comment.trim() || null, null)}
            returnKeyType="send"
            style={{ flex: 1, height: 46, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 14, fontSize: 16, color: th.text }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            onPress={() => sendComment(comment.trim() || null, null)}
            style={{ width: 46, height: 46, borderRadius: radius.field, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </SheetModal>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
        </Pressable>
      </Modal>

      {/* Categorie */}
      <SheetModal visible={sheet === 'category'} title={t('category')} onClose={() => setSheet(null)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((c) => {
            const sel = cat.id === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
                onPress={() => {
                  setCategory(c.id);
                  setCatManual(true);
                  setSheet(null);
                }}
                style={{ width: '30.5%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: th.card, borderWidth: 2, borderColor: sel ? th.accent : 'transparent' }}
              >
                <CategoryIcon icon={c.icon} tint={c.tint} />
                <Text style={{ fontSize: 13, color: th.text }}>{t(`cat_${c.id}` as never)}</Text>
              </Pressable>
            );
          })}
        </View>
      </SheetModal>
    </View>
  );
}

function IconBtn({ icon, label, onPress, color }: { icon: 'ellipsis-horizontal-circle-outline'; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

function SummaryRow({ label, value, onPress, last }: { label: string; value: string; onPress: () => void; last?: boolean }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line },
        pressed && { backgroundColor: th.segment },
      ]}
    >
      <Text style={{ fontSize: 16, color: th.sub }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: th.text, flexShrink: 1 }}>
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={th.sub} />
      </View>
    </Pressable>
  );
}

function ChoiceRow({ name, index, selected, onPress, last }: { name: string; index?: number; selected: boolean; onPress: () => void; last?: boolean }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}
    >
      {index !== undefined ? <Avatar name={name} index={index} /> : null}
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{name}</Text>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? th.accent : th.border} />
    </Pressable>
  );
}

function AmountRow({
  view,
  id,
  index,
  me,
  value,
  onChange,
  last,
}: {
  view: ListState;
  id: string;
  index: number;
  me: string | null;
  value: string;
  onChange: (v: string) => void;
  last?: boolean;
}) {
  const th = useTheme();
  const name = nameOf(view, id, me);
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}>
      <Avatar name={name} index={index} />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{name}</Text>
      <TextInput
        accessibilityLabel={t('amountFor', { name })}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="0,00"
        placeholderTextColor={th.sub}
        style={{ width: 110, height: 44, borderRadius: 12, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 12, fontSize: 16, color: th.text, textAlign: 'right' }}
      />
    </View>
  );
}

function Stepper({ value, onChange, name }: { value: number; onChange: (v: number) => void; name: string }) {
  const th = useTheme();
  const btn = { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: th.border, backgroundColor: th.card, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="adjustable" accessibilityLabel={t('sharesFor', { name, n: value })}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('lessShare', { name })} onPress={() => onChange(Math.max(0, value - 1))} style={[btn, value === 0 && { opacity: 0.4 }]}>
        <Ionicons name="remove" size={20} color={th.text} />
      </Pressable>
      <Text style={{ width: 28, textAlign: 'center', fontSize: 18, fontWeight: '700', color: th.text }}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('moreShare', { name })} onPress={() => onChange(Math.min(99, value + 1))} style={btn}>
        <Ionicons name="add" size={20} color={th.text} />
      </Pressable>
    </View>
  );
}

function Progress({ done, total, currency }: { done: number; total: number; currency: string }) {
  const th = useTheme();
  const ok = total > 0 && done === total;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={{ marginTop: 14 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ok ? <Ionicons name="checkmark" size={16} color={th.accentText} /> : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: ok ? th.accentText : done > total ? th.danger : th.sub }}>
            {ok ? t('allSplit') : done > total ? t('tooMuch', { amount: money(done - total, currency) }) : t('stillToSplit', { amount: money(total - done, currency) })}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: th.sub }}>
          {money(done, currency)} / {money(total, currency)}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: th.accentSoft, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 8, backgroundColor: done > total ? th.danger : th.accent }} />
      </View>
    </View>
  );
}

function SheetModal({
  visible,
  title,
  subtitle,
  onClose,
  children,
  doneDisabled,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  doneDisabled?: boolean;
}) {
  const th = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 52 }}>
          <View>
            <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: th.text }}>
              {title}
            </Text>
            {subtitle ? <Text style={{ fontSize: 14, color: th.sub }}>{subtitle}</Text> : null}
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingBottom: 34 }}>
          <Button label={t('done')} onPress={onClose} disabled={doneDisabled} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
});

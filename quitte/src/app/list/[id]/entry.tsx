import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Keypad } from '../../../components/Keypad';
import { showToast } from '../../../components/Toast';
import { Avatar, Button, Card, CategoryIcon, Segmented, TopBar } from '../../../components/ui';
import { CATEGORIES, categoryById, guessCategory } from '../../../lib/categories';
import { activeMembers, money, nameOf } from '../../../lib/domain';
import { dayLabel, isoDay, t } from '../../../lib/i18n';
import { nowIso, todayIso, uuid } from '../../../lib/ids';
import { centsToInput, keypadInput, parseMoney } from '../../../lib/money';
import { splitEqual, splitShares, sumParts } from '../../../lib/split';
import { enqueue, updateLocal, useList } from '../../../lib/store';
import { syncList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';
import type { Entry, Kind, ListState, Part, SplitMode } from '../../../lib/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Sheet = null | 'payer' | 'split' | 'date' | 'category' | 'to';

export default function EntryScreen() {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; entryId?: string; kind?: Kind }>();
  const { local, view } = useList(params.id);
  const existing = view?.entries.find((e) => e.id === params.entryId);
  const me = local?.me ?? null;
  const members = view ? activeMembers(view) : [];
  const order = members.map((m) => m.id);

  const [kind] = useState<Kind>(existing?.kind ?? params.kind ?? 'expense');
  const [amountStr, setAmountStr] = useState(existing ? centsToInput(existing.amount) : '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [catManual, setCatManual] = useState(!!existing?.category);
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const firstPayer = existing?.payers[0]?.m ?? me ?? order[0];
  const [multiPay, setMultiPay] = useState((existing?.payers.length ?? 1) > 1);
  const [payer, setPayer] = useState<string>(firstPayer);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>(
    Object.fromEntries((existing?.payers ?? []).map((p) => [p.m, centsToInput(p.a)])),
  );
  const [toId, setToId] = useState<string>(
    existing?.kind === 'transfer' ? existing.shares[0]?.m : (order.find((x) => x !== firstPayer) ?? order[0]),
  );
  const [mode, setMode] = useState<SplitMode>(existing?.splitMode ?? 'equal');
  const [included, setIncluded] = useState<string[]>(existing ? existing.shares.map((p) => p.m) : order);
  const [weights, setWeights] = useState<Record<string, number>>(
    existing?.weights ?? Object.fromEntries(order.map((id) => [id, 1])),
  );
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>(
    existing?.splitMode === 'amounts' ? Object.fromEntries(existing.shares.map((p) => [p.m, centsToInput(p.a)])) : {},
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState('');

  const amount = parseMoney(amountStr) ?? 0;

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
    if (amount <= 0) return setError(t('errAmount'));
    if (multiPay && payerSum !== amount) return setError(t('errPayers', { diff: money(amount - payerSum, cur) }));
    if (shares.length === 0) return setError(t('errNobody'));
    if (shareSum !== amount) return setError(t('errSplit', { diff: money(amount - shareSum, cur) }));
    if (kind === 'transfer' && payers[0]?.m === toId) return setError(t('errSelf'));
    const finalCat = kind === 'transfer' ? null : category ?? guessCategory(title);
    const entry: Entry = {
      id: existing?.id ?? uuid(),
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
    };
    const label = entry.title || (kind === 'transfer' ? t('repayment') : t(`cat_${categoryById(finalCat).id}` as never));
    enqueue(local.id, {
      op: 'entry',
      data: entry,
      summary: t(existing ? 'actEdited' : 'actAdded', { title: label, amount: money(amount, cur) }),
    });
    syncList(local.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
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

  const perPerson = mode === 'equal' && included.length > 0 && amount > 0 ? Math.floor(amount / included.length) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) }}>
      <TopBar
        backLabel={t('cancel')}
        title={heading}
        right={existing ? <IconBtn icon="trash-outline" label={t('delete')} onPress={remove} color={th.danger} /> : null}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <Text
          accessibilityRole="text"
          accessibilityLabel={t('amountA11y', { amount: money(amount, cur) })}
          style={{ textAlign: 'center', fontSize: compact ? 44 : 52, fontWeight: '700', letterSpacing: -1.5, color: amount ? th.text : th.sub, paddingVertical: compact ? 6 : 12 }}
        >
          {money(amount, cur).replace(/[\d.,]+/, amountStr ? amountStr : '0')}
        </Text>

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
          <SummaryRow label={t('date')} value={dayLabel(date)} onPress={() => setSheet('date')} last />
        </Card>
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
        {mode === 'shares' && (local.splitKeys?.length ?? 0) > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            {local.splitKeys!.map((k) => (
              <Pressable
                key={k.id}
                accessibilityRole="button"
                accessibilityLabel={t('useKey', { name: k.name })}
                onPress={() => setWeights({ ...Object.fromEntries(order.map((id) => [id, 0])), ...k.weights })}
                onLongPress={() =>
                  Alert.alert(t('removeKeyTitle', { name: k.name }), undefined, [
                    { text: t('cancel'), style: 'cancel' },
                    { text: t('delete'), style: 'destructive', onPress: () => updateLocal(local.id, { splitKeys: local.splitKeys!.filter((x) => x.id !== k.id) }) },
                  ])
                }
                style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: th.accentSoft, justifyContent: 'center' }}
              >
                <Text style={{ color: th.accentText, fontWeight: '600', fontSize: 14 }}>{k.name}</Text>
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
              updateLocal(local.id, {
                splitKeys: [...(local.splitKeys ?? []), { id: uuid(), name: nm.slice(0, 40), weights: { ...weights } }],
              });
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
                style={{ width: '30.5%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, backgroundColor: th.card, borderWidth: 2, borderColor: sel ? th.accent : 'transparent' }}
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

function IconBtn({ icon, label, onPress, color }: { icon: 'trash-outline'; label: string; onPress: () => void; color: string }) {
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

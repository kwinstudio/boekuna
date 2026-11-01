import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CategoryIcon, Screen, TopBar } from '../../../components/ui';
import { computeBreakdown } from '../../../lib/balances';
import { categoryById } from '../../../lib/categories';
import { money, nameOf, payerLine } from '../../../lib/domain';
import { dayLabel, t } from '../../../lib/i18n';
import { useList } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';
import type { Entry } from '../../../lib/types';

/** Effect van één post op het saldo van een persoon (in centen; + = krijgt geld). */
function effect(e: Entry, m: string): number {
  const paid = e.payers.filter((p) => p.m === m).reduce((s, p) => s + p.a, 0);
  const part = e.shares.filter((p) => p.m === m).reduce((s, p) => s + p.a, 0);
  if (e.kind === 'income') return part - paid;
  return paid - part; // uitgave en terugbetaling
}

/** Waar komt mijn saldo vandaan: elke post die iemands saldo raakt, met het effect erop. */
export default function Person() {
  const th = useTheme();
  const { id, m } = useLocalSearchParams<{ id: string; m: string }>();
  const { local, view } = useList(id);
  const rows = useMemo(
    () => (view ? view.entries.map((e) => ({ e, d: effect(e, String(m)) })).filter((r) => r.d !== 0) : []),
    [view, m],
  );
  if (!local || !view) return null;
  const cur = view.list.currency;
  const bd = computeBreakdown(view.entries, view.members)[String(m)];
  const bal = bd?.balance ?? 0;
  const name = nameOf(view, String(m), local.me);

  return (
    <Screen>
      <TopBar backLabel={t('back')} title={name} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
        ListHeaderComponent={
          <Card style={{ padding: 16, marginBottom: 12, gap: 6 }}>
            <Text style={{ fontSize: 13, color: th.sub }}>{t('balance')}</Text>
            <Text style={{ fontSize: 22, fontWeight: '600', color: bal === 0 ? th.text : bal > 0 ? th.gain : th.owe }}>
              {bal === 0 ? t('square') : bal > 0 ? t('getsAmount', { amount: money(bal, cur) }) : t('paysAmount', { amount: money(-bal, cur) })}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: th.sub }}>{t('personHint')}</Text>
          </Card>
        }
        ListEmptyComponent={<Text style={{ color: th.sub, textAlign: 'center', marginTop: 20 }}>{t('noResults')}</Text>}
        renderItem={({ item: { e, d } }) => {
          const cat = categoryById(e.category);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/list/[id]/entry', params: { id: local.id, entryId: e.id } })}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line },
                pressed && { opacity: 0.6 },
              ]}
            >
              <CategoryIcon icon={e.kind === 'transfer' ? 'swap-horizontal' : cat.icon} tint="gray" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: th.text }}>
                  {e.kind === 'transfer' ? t('repayment') : e.title || t(`cat_${cat.id}` as never)}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: th.sub }}>
                  {dayLabel(e.date)} · {payerLine(e, view, local.me)} · {money(e.amount, cur)}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: d > 0 ? th.gain : th.owe }}>
                {d > 0 ? '+ ' : '− '}
                {money(Math.abs(d), cur)}
              </Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

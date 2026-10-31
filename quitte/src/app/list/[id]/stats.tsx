import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Card, CategoryIcon, Screen, SectionLabel, TopBar } from '../../../components/ui';
import { computeBreakdown, totalSpent } from '../../../lib/balances';
import { categoryById } from '../../../lib/categories';
import { money, nameOf } from '../../../lib/domain';
import { t } from '../../../lib/i18n';
import { useList } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

export default function Stats() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { view, local } = useList(id);

  const data = useMemo(() => {
    if (!view) return null;
    const total = totalSpent(view.entries);
    const byCat = new Map<string, number>();
    for (const e of view.entries) {
      if (e.kind !== 'expense') continue;
      const c = categoryById(e.category).id;
      byCat.set(c, (byCat.get(c) ?? 0) + e.amount);
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const bd = computeBreakdown(view.entries, view.members);
    const people = view.members
      .map((m) => ({ id: m.id, paid: bd[m.id]?.paid ?? 0, share: bd[m.id]?.share ?? 0 }))
      .filter((p) => p.paid || p.share)
      .sort((a, b) => b.share - a.share);
    const count = view.entries.filter((e) => e.kind === 'expense').length;
    return { total, cats, people, count };
  }, [view]);

  if (!view || !data || !local) return null;
  const cur = view.list.currency;
  const maxCat = Math.max(1, ...data.cats.map((c) => c[1]));
  const maxP = Math.max(1, ...data.people.map((p) => Math.max(p.paid, p.share)));

  return (
    <Screen bottom={false}>
      <TopBar backLabel={t('back')} title={t('stats')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Card style={{ flex: 1, padding: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: th.text }}>{money(data.total, cur)}</Text>
            <Text style={{ fontSize: 12, color: th.sub }}>{t('spentTogether')}</Text>
          </Card>
          <Card style={{ flex: 1, padding: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: th.text }}>{data.count ? money(Math.round(data.total / data.count), cur) : '—'}</Text>
            <Text style={{ fontSize: 12, color: th.sub }}>{t('avgExpense')}</Text>
          </Card>
        </View>

        <SectionLabel>{t('perCategory')}</SectionLabel>
        <Card style={{ padding: 14, gap: 14 }}>
          {data.cats.length === 0 ? <Text style={{ color: th.sub }}>{t('noData')}</Text> : null}
          {data.cats.map(([cid, amt]) => {
            const c = categoryById(cid);
            return (
              <View key={cid} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${t(`cat_${cid}` as never)}: ${money(amt, cur)}`}>
                <CategoryIcon icon={c.icon} tint={c.tint} size={32} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 14, color: th.text }}>{t(`cat_${cid}` as never)}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: th.text }}>{money(amt, cur)}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: th.segment }}>
                    <View style={{ width: `${Math.round((amt / maxCat) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
                  </View>
                </View>
              </View>
            );
          })}
        </Card>

        <SectionLabel>{t('perPersonStats')}</SectionLabel>
        <Card style={{ padding: 14, gap: 14 }}>
          {data.people.map((p) => (
            <View key={p.id} accessible accessibilityLabel={`${nameOf(view, p.id, local.me)}: ${t('legendPaid')} ${money(p.paid, cur)}, ${t('legendShare')} ${money(p.share, cur)}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: th.text }}>{nameOf(view, p.id, local.me)}</Text>
                <Text style={{ fontSize: 13, color: th.sub }}>
                  {money(p.paid, cur)} / {money(p.share, cur)}
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: th.segment, marginBottom: 3 }}>
                <View style={{ width: `${Math.round((p.paid / maxP) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: th.accent }} />
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: th.segment }}>
                <View style={{ width: `${Math.round((p.share / maxP) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: th.oweBar }} />
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Legend color={th.accent} label={t('legendPaid')} />
            <Legend color={th.oweBar} label={t('legendShare')} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: th.sub }}>{label}</Text>
    </View>
  );
}

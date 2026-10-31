import { useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { showToast } from '../../../components/Toast';
import { Card, CategoryIcon, Screen, TopBar } from '../../../components/ui';
import { categoryById } from '../../../lib/categories';
import { money, payerLine } from '../../../lib/domain';
import { dayLabel, t } from '../../../lib/i18n';
import { nowIso } from '../../../lib/ids';
import { enqueue, useList } from '../../../lib/store';
import { syncList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';

/** Prullenbak: verwijderde uitgaven blijven 30 dagen terug te zetten. */
export default function Trash() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { local, view } = useList(id);
  if (!local || !view) return null;
  const items = view.trash ?? [];
  const cur = view.list.currency;

  const restore = (eid: string) => {
    const e = items.find((x) => x.id === eid);
    if (!e) return;
    enqueue(local.id, {
      op: 'entry',
      data: { ...e, deleted: false, deletedAt: null, updatedAt: nowIso() },
      summary: t('actRestored', { title: e.title || t('noTitle') }),
    });
    syncList(local.id);
    showToast(t('restored'));
  };

  return (
    <Screen>
      <TopBar backLabel={t('back')} title={t('trash')} />
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
        ListHeaderComponent={<Text style={{ fontSize: 14, color: th.sub, marginBottom: 12 }}>{t('trashHint')}</Text>}
        ListEmptyComponent={
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: th.sub }}>{t('trashEmpty')}</Text>
          </Card>
        }
        renderItem={({ item: e }) => {
          const cat = categoryById(e.category);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }}>
              <CategoryIcon icon={e.kind === 'transfer' ? 'swap-horizontal' : cat.icon} tint="gray" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: th.text }}>
                  {e.title || t(`cat_${cat.id}` as never)} · {money(e.amount, cur)}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: th.sub }}>
                  {dayLabel(e.date)} · {payerLine(e, view, local.me)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('restoreA11y', { title: e.title || t('noTitle') })}
                onPress={() => restore(e.id)}
                style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: radius.chip, backgroundColor: th.accentSoft, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: th.accentText }}>{t('restore')}</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}

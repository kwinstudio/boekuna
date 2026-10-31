import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Screen } from '../../../components/ui';
import { money } from '../../../lib/domain';
import { t } from '../../../lib/i18n';
import { nowIso } from '../../../lib/ids';
import { enqueue, useList } from '../../../lib/store';
import { syncList } from '../../../lib/sync';
import { useTheme } from '../../../lib/theme';

export default function Done() {
  const th = useTheme();
  const { id, batch, count, total } = useLocalSearchParams<{ id: string; batch: string; count: string; total: string }>();
  const { view, local } = useList(id);
  const [undoLeft, setUndoLeft] = useState(8);

  useEffect(() => {
    const iv = setInterval(() => setUndoLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, []);

  if (!view || !local) return null;
  const cur = view.list.currency;
  const expenses = view.entries.filter((e) => e.kind === 'expense').length;

  const undo = () => {
    enqueue(local.id, { op: 'delete_batch', batchId: String(batch), data: { updatedAt: nowIso() }, summary: t('actUndoSettle') });
    syncList(local.id);
    router.back();
  };

  const archive = () => {
    enqueue(local.id, { op: 'list', data: { archived: true, updatedAt: nowIso() }, summary: t('actArchived') });
    syncList(local.id);
    router.dismissAll();
    router.replace('/');
  };

  return (
    <Screen style={{ paddingHorizontal: 20 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark-circle-outline" size={48} color={th.accent} style={{ marginBottom: 14 }} />
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: th.text, textAlign: 'center' }}>
          {t('doneTitle')}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: th.sub, textAlign: 'center', marginTop: 8, marginBottom: 28, maxWidth: 300 }}>
          {t('doneBody', { list: view.list.name })}
        </Text>
        <Card style={{ alignSelf: 'stretch' }}>
          <Stat value={money(Number(total) || 0, cur)} label={t('spentTogether')} />
          <Stat value={String(expenses)} label={t('statExpenses')} />
          <Stat value={String(count)} label={t('statPayments')} last />
        </Card>
      </View>
      {undoLeft > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: th.toast, borderRadius: 14, minHeight: 52, paddingLeft: 16, paddingRight: 6, marginBottom: 14 }}>
          <Text style={{ flex: 1, color: th.toastText, fontSize: 15 }}>{t('settleSaved')}</Text>
          <Pressable accessibilityRole="button" onPress={undo} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text style={{ color: th.toastAction, fontSize: 15, fontWeight: '700' }}>
              {t('undo')} ({undoLeft})
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Button label={t('archiveList')} onPress={archive} style={{ marginBottom: 10 }} />
      <Button label={t('continueList')} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function Stat({ value, label, last }: { value: string; label: string; last?: boolean }) {
  const th = useTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: th.line }}>
      <Text style={{ fontSize: 16, color: th.sub }}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>{value}</Text>
    </View>
  );
}

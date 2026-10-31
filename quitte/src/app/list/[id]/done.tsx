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
        <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={44} color={th.onAccent} />
          </View>
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700', letterSpacing: -0.7, color: th.text, textAlign: 'center' }}>
          {t('doneTitle')}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: th.sub, textAlign: 'center', marginTop: 8, marginBottom: 28, maxWidth: 300 }}>
          {t('doneBody', { list: view.list.name })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
          <Stat value={money(Number(total) || 0, cur)} label={t('spentTogether')} />
          <Stat value={String(expenses)} label={t('statExpenses')} />
          <Stat value={String(count)} label={t('statPayments')} />
        </View>
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

function Stat({ value, label }: { value: string; label: string }) {
  const th = useTheme();
  return (
    <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 18, fontWeight: '700', color: th.text }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: th.sub, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </Card>
  );
}

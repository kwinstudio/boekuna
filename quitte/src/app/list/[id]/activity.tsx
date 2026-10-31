import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '../../../components/ui';
import { t, timeLabel } from '../../../lib/i18n';
import { useList } from '../../../lib/store';
import { useTheme } from '../../../lib/theme';

export default function ActivityScreen() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { view, local } = useList(id);
  if (!view || !local) return null;
  return (
    <Screen bottom={false}>
      <TopBar backLabel={t('back')} title={t('history')} />
      <FlatList
        data={view.activity}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          local.pending.length ? (
            <Text style={{ fontSize: 13, color: th.sub, paddingVertical: 10 }}>{t('pendingChanges', { n: local.pending.length })}</Text>
          ) : undefined
        }
        ListEmptyComponent={<Text style={{ color: th.sub, textAlign: 'center', marginTop: 30 }}>{t('noHistory')}</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }}>
            <Text style={{ fontSize: 15, color: th.text }}>
              {item.actor ? <Text style={{ fontWeight: '700' }}>{item.actor}: </Text> : null}
              {item.summary}
            </Text>
            <Text style={{ fontSize: 12, color: th.sub, marginTop: 2 }}>{timeLabel(item.at)}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

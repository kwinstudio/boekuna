import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { BottomBar } from '../components/BottomBar';
import { ListBadge } from '../components/LookPicker';
import { Avatar, Card, Screen } from '../components/ui';
import { t, timeLabel } from '../lib/i18n';
import { listLook } from '../lib/look';
import { useStore, viewOf } from '../lib/store';
import { syncAll } from '../lib/sync';
import { useTheme } from '../lib/theme';

/** Alles wat er in je lijsten gebeurde, nieuwste eerst. */
export default function ActivityScreen() {
  const th = useTheme();
  const lists = useStore((s) => s.lists);
  const [refreshing, setRefreshing] = useState(false);
  const items = useMemo(() => {
    const out: { key: string; listId: string; listName: string; look: ReturnType<typeof listLook>; actor: string; summary: string; at: string }[] = [];
    for (const l of Object.values(lists)) {
      const v = viewOf(l);
      if (!v) continue;
      const look = listLook(v.list);
      for (const a of v.activity ?? []) out.push({ key: `${l.id}-${a.id}`, listId: l.id, listName: v.list.name, look, actor: a.actor, summary: a.summary, at: a.at });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150);
  }, [lists]);

  return (
    <Screen bottom={false}>
      <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700', letterSpacing: -0.7, color: th.text, paddingHorizontal: 20, marginTop: 4, marginBottom: 14 }}>
        {t('activityTab')}
      </Text>
      <FlatList
        data={items}
        keyExtractor={(x) => x.key}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={th.sub}
            onRefresh={async () => {
              setRefreshing(true);
              syncAll();
              setTimeout(() => setRefreshing(false), 900);
            }}
          />
        }
        ListEmptyComponent={
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, color: th.sub, textAlign: 'center' }}>{t('activityEmpty')}</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/list/${item.listId}`)}
            style={({ pressed }) => [{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }, pressed && { opacity: 0.6 }]}
          >
            <View>
              <ListBadge hue={item.look.hue} icon={item.look.icon} size={40} />
              {item.actor ? (
                <View style={{ position: 'absolute', right: -4, bottom: -4 }}>
                  <Avatar name={item.actor} size={20} ring={th.bg} />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: th.text, lineHeight: 20 }}>
                <Text style={{ fontWeight: '600' }}>{item.actor || t('someone')}</Text> {item.summary}
              </Text>
              <Text style={{ fontSize: 13, color: th.sub, marginTop: 2 }}>
                {item.listName} · {timeLabel(item.at)}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <BottomBar active="activity" />
    </Screen>
  );
}

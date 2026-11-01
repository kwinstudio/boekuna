import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, EmptyState, ModeBadge, tap, Txt } from '../../components/ui';
import { formatWhen, isBlank, previewText, searchNotes } from '../../lib/notesync';
import { createNote, deleteNote, pullAll, useStore } from '../../lib/store';
import { radius, space, type as t, useColors } from '../../lib/theme';
import type { LocalNote } from '../../lib/types';

function confirmDelete(n: LocalNote) {
  const name = n.title.trim() || 'deze notitie';
  const go = () => deleteNote(n.id);
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`“${name}” verwijderen?`)) go();
    return;
  }
  Alert.alert('Notitie verwijderen?', `“${name}” en het bijbehorende AI-gesprek worden verwijderd. Dit kan niet ongedaan worden.`, [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: go },
  ]);
}

function NoteCard({ note }: { note: LocalNote }) {
  const c = useColors();
  const lines = note.content.trim().split('\n');
  const title = note.title.trim() || lines[0]?.trim() || 'Naamloze notitie';
  const preview = previewText(note.title.trim() ? note.content : lines.slice(1).join(' '));
  return (
    <Card
      onPress={() => router.push(`/note/${note.id}`)}
      onLongPress={() => {
        tap();
        confirmDelete(note);
      }}
      accessibilityLabel={`${title}. ${preview}`}
      style={{ gap: 6 }}
    >
      <Txt variant="headline" numberOfLines={1}>
        {title}
      </Txt>
      {preview ? (
        <Txt variant="callout" color="muted" numberOfLines={2}>
          {preview}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 }}>
        <Txt variant="caption" color="faint">
          {formatWhen(note.localEditedAt)}
        </Txt>
        <ModeBadge mode={note.ai_mode} />
        <View style={{ flex: 1 }} />
        {note.dirty ? (
          <View accessibilityLabel="Nog niet gesynchroniseerd" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="cloud-upload-outline" size={13} color={c.faint} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function Notes() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const notesMap = useStore((s) => s.notes);
  const loaded = useStore((s) => s.notesLoaded);
  const sync = useStore((s) => s.sync);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const notes = useMemo(() => searchNotes(Object.values(notesMap).filter((n) => n.synced || !isBlank(n)), query), [notesMap, query]);
  const total = useMemo(() => Object.values(notesMap).filter((n) => n.synced || !isBlank(n)).length, [notesMap]);

  const newNote = () => {
    tap();
    const id = createNote();
    router.push(`/note/${id}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NoteCard note={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.muted}
            onRefresh={async () => {
              setRefreshing(true);
              await pullAll().catch(() => {});
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="largeTitle" accessibilityRole="header">
                Notities
              </Txt>
              {sync === 'offline' ? (
                <View accessibilityLabel="Offline. Wijzigingen worden later opgeslagen." style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="cloud-offline-outline" size={16} color={c.faint} />
                  <Txt variant="caption" color="faint">
                    Offline
                  </Txt>
                </View>
              ) : null}
            </View>
            {total > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  backgroundColor: c.surfaceAlt,
                  borderRadius: radius.md,
                  paddingHorizontal: space.md,
                  minHeight: 40,
                }}
              >
                <Ionicons name="search" size={16} color={c.faint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Zoek in titels en tekst"
                  placeholderTextColor={c.faint}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  autoCorrect={false}
                  accessibilityLabel="Zoeken"
                  style={[t.callout, { flex: 1, color: c.text, paddingVertical: 8 }]}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loaded ? undefined : query ? (
            <EmptyState icon="search-outline" title="Niets gevonden" body={`Geen notities met “${query}”.`} />
          ) : (
            <EmptyState
              icon="create-outline"
              title="Begin met een gedachte"
              body="Schrijf een idee op. Kies per notitie of de AI stil blijft of meedenkt."
            />
          )
        }
      />
      <Pressable
        onPress={newNote}
        accessibilityRole="button"
        accessibilityLabel="Nieuwe notitie"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.primary, shadowColor: c.shadow, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        ]}
      >
        <Ionicons name="add" size={28} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space.xl,
    bottom: space.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});

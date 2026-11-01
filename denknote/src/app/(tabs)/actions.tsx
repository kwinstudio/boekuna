import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Card, EmptyState, IconButton, Segmented, Thinking, tap, Txt } from '../../components/ui';
import { ApiError, createTask, deleteTask, loadTasks, setTaskCompleted } from '../../lib/api';
import { useStore } from '../../lib/store';
import { radius, space, type as t, useColors } from '../../lib/theme';
import type { Task } from '../../lib/types';

function confirmDelete(task: Task, go: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`“${task.title}” verwijderen?`)) go();
    return;
  }
  Alert.alert('Actie verwijderen?', task.title, [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: go },
  ]);
}

export default function Actions() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const notes = useStore((s) => s.notes);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTasks(await loadTasks());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Acties laden lukte niet.');
      setTasks((cur) => cur ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const visible = useMemo(() => (tasks ?? []).filter((x) => (filter === 'open' ? !x.completed : x.completed)), [tasks, filter]);

  async function add() {
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      const task = await createTask({ title });
      setTasks((cur) => [task, ...(cur ?? [])]);
      setDraft('');
      setFilter('open');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function toggle(task: Task) {
    tap();
    const next = { ...task, completed: !task.completed };
    setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? next : x)));
    try {
      const saved = await setTaskCompleted(task.id, next.completed);
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? saved : x)));
    } catch (e) {
      setTasks((cur) => (cur ?? []).map((x) => (x.id === task.id ? task : x)));
      setError((e as Error).message);
    }
  }

  function remove(task: Task) {
    confirmDelete(task, async () => {
      const before = tasks;
      setTasks((cur) => (cur ?? []).filter((x) => x.id !== task.id));
      try {
        await deleteTask(task.id);
      } catch (e) {
        setTasks(before);
        setError((e as Error).message);
      }
    });
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(x) => x.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={c.muted}
          onRefresh={async () => {
            setRefreshing(true);
            await reload();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: 48 }}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.lg }}>
          <Txt variant="largeTitle" accessibilityRole="header">
            Acties
          </Txt>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: c.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: c.border,
              paddingLeft: space.lg,
              paddingRight: 4,
              minHeight: 50,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Nieuwe actie…"
              placeholderTextColor={c.faint}
              returnKeyType="done"
              onSubmitEditing={add}
              maxLength={300}
              accessibilityLabel="Nieuwe actie"
              style={[t.callout, { flex: 1, color: c.text, paddingVertical: 12 }]}
            />
            <IconButton icon="add-circle" label="Actie toevoegen" color={c.text} size={26} onPress={add} disabled={!draft.trim() || adding} />
          </View>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'done', label: 'Afgerond' },
            ]}
          />
          {error ? <Banner text={error} tone="danger" icon="alert-circle-outline" onPress={() => setError(null)} /> : null}
        </View>
      }
      ListEmptyComponent={
        tasks === null ? (
          <View style={{ padding: space.xl }}>
            <Thinking label="Acties laden…" />
          </View>
        ) : filter === 'open' ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Geen open acties"
            body="Voeg hierboven een actie toe, of sla een voorgestelde vervolgstap uit een notitie op."
          />
        ) : (
          <EmptyState icon="trophy-outline" title="Nog niets afgerond" body="Afgeronde acties verschijnen hier." />
        )
      }
      renderItem={({ item }) => {
        const note = item.note_id ? notes[item.note_id] : undefined;
        const noteTitle = note ? note.title.trim() || note.content.trim().split('\n')[0] || 'Naamloze notitie' : null;
        return (
          <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md }}>
            <Pressable
              onPress={() => toggle(item)}
              hitSlop={10}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.completed }}
              accessibilityLabel={item.completed ? 'Markeer als open' : 'Markeer als afgerond'}
              style={{ paddingTop: 1 }}
            >
              <Ionicons name={item.completed ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={item.completed ? c.accent : c.faint} />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt
                variant="callout"
                style={item.completed ? { textDecorationLine: 'line-through', color: c.muted } : undefined}
              >
                {item.title}
              </Txt>
              {noteTitle ? (
                <Pressable
                  onPress={() => router.push(`/note/${item.note_id}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open notitie ${noteTitle}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 }}
                >
                  <Ionicons name="document-text-outline" size={12} color={c.accent} />
                  <Txt variant="footnote" color="accent" numberOfLines={1}>
                    {noteTitle}
                  </Txt>
                </Pressable>
              ) : null}
            </View>
            <IconButton icon="trash-outline" size={18} color={c.faint} label="Actie verwijderen" onPress={() => remove(item)} />
          </Card>
        );
      }}
    />
  );
}

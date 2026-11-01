import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_PRESETS, type ChatPreset } from '../../../../supabase/functions/_shared/logic';
import { Banner, Chip, EmptyState, FadeIn, IconButton, Thinking, tap, Txt } from '../../../components/ui';
import { ApiError, loadMessages, sendChat } from '../../../lib/api';
import { flush, getState, useStore } from '../../../lib/store';
import { radius, space, type as t, useColors } from '../../../lib/theme';
import type { ChatMessage } from '../../../lib/types';

const PRESET_ICONS: Record<ChatPreset, 'help-circle-outline' | 'git-compare-outline' | 'expand-outline' | 'footsteps-outline'> = {
  question: 'help-circle-outline',
  critical: 'git-compare-outline',
  expand: 'expand-outline',
  first_step: 'footsteps-outline',
};

function Bubble({ m }: { m: ChatMessage }) {
  const c = useColors();
  const mine = m.role === 'user';
  return (
    <FadeIn style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '88%',
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: radius.lg,
          borderBottomRightRadius: mine ? 6 : radius.lg,
          borderBottomLeftRadius: mine ? radius.lg : 6,
          backgroundColor: mine ? c.primary : c.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: c.border,
        }}
      >
        <Txt variant="callout" color={mine ? 'onPrimary' : 'text'} selectable>
          {m.content}
        </Txt>
      </View>
    </FadeIn>
  );
}

export default function Chat() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const note = useStore((s) => (id ? s.notes[id] : undefined));
  const insets = useSafeAreaInsets();
  const c = useColors();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = () => {
    if (!id) return;
    setLoadError(false);
    loadMessages(id)
      .then(setMessages)
      .catch(() => {
        setMessages([]);
        setLoadError(true);
      });
  };
  useEffect(load, [id]);

  useEffect(() => {
    if (q && !draft) setDraft(`Over je vraag “${q}”: `);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function send(preset?: ChatPreset) {
    if (!id || pending) return;
    const text = preset ? '' : draft.trim();
    if (!text && !preset) return;
    setError(null);
    const visible = text || CHAT_PRESETS[preset!].label;
    const temp: ChatMessage = { id: 'pending', note_id: id, role: 'user', content: visible, created_at: new Date().toISOString() };
    setPending(temp);
    if (!preset) setDraft('');
    try {
      const ok = await flush();
      const n = getState().notes[id];
      if (!ok || !n?.synced) throw new ApiError('network', 'Je notitie is nog niet opgeslagen op de server. Controleer je verbinding.');
      const res = await sendChat(id, text, text ? undefined : preset);
      setMessages((cur) => [...(cur ?? []), ...res.messages]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Versturen lukte niet. Probeer het opnieuw.');
      if (text) setDraft(text);
    } finally {
      setPending(null);
    }
  }

  const data = [...(messages ?? []), ...(pending ? [pending] : [])];
  const title = note?.title.trim() || note?.content.trim().split('\n')[0] || 'Naamloze notitie';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <IconButton icon="chevron-back" label="Terug naar notitie" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/note/${id}`))} />
        <View style={{ flex: 1 }}>
          <Txt variant="headline" accessibilityRole="header">
            Sparren
          </Txt>
          <Txt variant="caption" color="muted" numberOfLines={1}>
            {title}
          </Txt>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble m={item} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          messages === null ? (
            <View style={{ padding: space.xl }}>
              <Thinking label="Gesprek laden…" />
            </View>
          ) : (
            <EmptyState
              icon="chatbubbles-outline"
              title="Denk hardop"
              body="Kies een vraag hieronder of stel je eigen vraag. De AI kent deze notitie en jullie eerdere gesprek."
            />
          )
        }
        ListFooterComponent={
          <View style={{ gap: space.md, marginTop: data.length ? space.md : 0 }}>
            {pending ? <Thinking /> : null}
            {loadError ? <Banner text="Eerdere berichten laden lukte niet. Tik om opnieuw te proberen." tone="danger" onPress={load} /> : null}
            {error ? <Banner text={error} tone="danger" icon="alert-circle-outline" onPress={() => setError(null)} /> : null}
          </View>
        }
      />

      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm, paddingBottom: insets.bottom + space.sm, gap: space.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }} keyboardShouldPersistTaps="handled">
          {(Object.keys(CHAT_PRESETS) as ChatPreset[]).map((p) => (
            <Chip key={p} label={CHAT_PRESETS[p].label} icon={PRESET_ICONS[p]} onPress={() => send(p)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.lg }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Stel een vraag over je idee…"
            placeholderTextColor={c.faint}
            multiline
            maxLength={4000}
            accessibilityLabel="Bericht"
            style={[
              t.callout,
              {
                flex: 1,
                color: c.text,
                backgroundColor: c.surface,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: space.lg,
                paddingTop: 11,
                paddingBottom: 11,
                maxHeight: 140,
              },
            ]}
          />
          <Pressable
            onPress={() => {
              tap();
              send();
            }}
            disabled={!draft.trim() || !!pending}
            accessibilityRole="button"
            accessibilityLabel="Verstuur"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !draft.trim() || pending ? 0.35 : pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="arrow-up" size={20} color={c.onPrimary} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

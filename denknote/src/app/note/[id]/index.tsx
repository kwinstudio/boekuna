import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isMeaningfulChange, noteText } from '../../../../supabase/functions/_shared/logic';
import { Banner, Button, Card, FadeIn, IconButton, MODE_META, Segmented, Thinking, tap, Txt } from '../../../components/ui';
import { analyzeNote, ApiError, createTask, dismissSuggestionPart, latestSuggestion } from '../../../lib/api';
import { deleteNote, discardIfBlank, flush, getState, markAnalyzedLocal, queueEmbedding, setNoteMode, updateNote, useStore } from '../../../lib/store';
import { radius, space, type as t, useColors } from '../../../lib/theme';
import type { AiMode, Suggestion } from '../../../lib/types';

function confirm(title: string, message: string, ok: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Annuleren', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

function SaveState({ id }: { id: string }) {
  const dirty = useStore((s) => s.notes[id]?.dirty ?? false);
  const sync = useStore((s) => s.sync);
  const label = !dirty ? 'Opgeslagen' : sync === 'offline' ? 'Lokaal bewaard' : sync === 'error' ? 'Opnieuw proberen…' : 'Opslaan…';
  const icon = !dirty ? 'checkmark' : sync === 'offline' ? 'cloud-offline-outline' : 'ellipsis-horizontal';
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={13} color={c.faint} />
      <Txt variant="caption" color="faint">
        {label}
      </Txt>
    </View>
  );
}

export default function NoteEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const note = useStore((s) => (id ? s.notes[id] : undefined));
  const notes = useStore((s) => s.notes);
  const allowRelated = useStore((s) => s.profile.allow_related);
  const insets = useSafeAreaInsets();
  const c = useColors();
  const contentRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<false | 'done' | 'manual'>(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [focused, setFocused] = useState(false);
  const busyRef = useRef(false);

  // Laatste suggestie laden bij openen.
  const synced = note?.synced ?? false;
  useEffect(() => {
    if (!id || !synced) return;
    let alive = true;
    latestSuggestion(id)
      .then((s) => alive && setSuggestion((cur) => (cur && s && cur.content_version > s.content_version ? cur : s)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, synced]);

  // Bij verlaten: lege notitie opruimen en direct opslaan.
  // (Bij openen van de chat blijft dit scherm bestaan; pas bij echt verlaten wordt dit uitgevoerd.)
  useEffect(() => {
    return () => {
      if (!id) return;
      discardIfBlank(id);
      flush()
        .then(() => queueEmbedding(id))
        .catch(() => {});
    };
  }, [id]);

  const runAnalysis = useCallback(
    async (trigger: 'done' | 'manual') => {
      if (!id || busyRef.current) return;
      busyRef.current = true;
      setBusy(trigger);
      setError(null);
      setInfo(null);
      try {
        const ok = await flush();
        const n = getState().notes[id];
        if (!n) return;
        if (!ok || n.dirty || !n.synced) {
          setInfo('Je notitie is lokaal bewaard. De AI denkt mee zodra je weer online bent.');
          return;
        }
        const text = noteText(n.title, n.content);
        if (trigger === 'done') {
          if (n.ai_mode !== 'thinking') return;
          if (n.last_analyzed_version >= n.content_version || !isMeaningfulChange(n.last_analyzed_content, text)) return;
        }
        const res = await analyzeNote(id, trigger);
        if (res.suggestion) {
          setSuggestion((cur) => (cur && cur.content_version > res.suggestion!.content_version ? cur : res.suggestion!));
        }
        if (res.status === 'ok' || res.status === 'nothing_to_add') markAnalyzedLocal(id, n.content_version, text);
        if (res.status === 'nothing_to_add') setInfo('Niets wezenlijks toe te voegen op dit moment.');
        if (res.status === 'too_short') setInfo('Schrijf eerst wat meer, dan kan de AI meedenken.');
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Er ging iets mis. Probeer het opnieuw.');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [id],
  );

  if (!id || !note) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, gap: space.lg }}>
        <IconButton icon="chevron-back" label="Terug" onPress={() => router.back()} />
        <Txt variant="title">Notitie niet gevonden</Txt>
        <Txt color="muted">Misschien is hij verwijderd.</Txt>
      </View>
    );
  }

  const mode: AiMode = note.ai_mode;
  const showQuestion = !!suggestion && !suggestion.dismissed && !!suggestion.question && !suggestion.question_dismissed;
  const showAction = !!suggestion && !suggestion.dismissed && !!suggestion.proposed_action && !suggestion.action_dismissed;
  const related = (allowRelated && suggestion && !suggestion.dismissed ? suggestion.related_note_ids : [])
    .map((rid) => notes[rid])
    .filter((n): n is NonNullable<typeof n> => !!n);
  const outdated = !!suggestion && suggestion.content_version < note.content_version;

  async function onDone() {
    Keyboard.dismiss();
    setFocused(false);
    await runAnalysis('done');
  }

  async function onDelete() {
    if (!(await confirm('Notitie verwijderen?', 'De notitie en het AI-gesprek worden verwijderd.', 'Verwijderen', true))) return;
    deleteNote(id);
    router.back();
  }

  async function dismiss(part: 'question' | 'action' | 'all') {
    if (!suggestion) return;
    const before = suggestion;
    setSuggestion({
      ...before,
      ...(part === 'all' ? { dismissed: true } : part === 'question' ? { question_dismissed: true } : { action_dismissed: true }),
    });
    try {
      setSuggestion(await dismissSuggestionPart(before, part));
    } catch (e) {
      setSuggestion(before);
      setError((e as Error).message);
    }
  }

  async function actionToTask() {
    if (!suggestion?.proposed_action) return;
    const ok = await confirm('Actie opslaan?', suggestion.proposed_action, 'Opslaan');
    if (!ok) return;
    setSavingTask(true);
    try {
      await createTask({ title: suggestion.proposed_action, note_id: id, suggestion_id: suggestion.id });
      const before = suggestion;
      setSuggestion({ ...before, action_dismissed: true });
      dismissSuggestionPart(before, 'action').catch(() => {});
      setInfo('Actie opgeslagen bij Acties.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTask(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Bovenbalk */}
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingHorizontal: space.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
        }}
      >
        <IconButton icon="chevron-back" label="Terug naar notities" onPress={() => (router.canGoBack() ? router.back() : router.replace('/notes'))} />
        <SaveState id={id} />
        <View style={{ flex: 1 }} />
        <IconButton icon="chatbubbles-outline" label="AI-sparringpartner" onPress={() => router.push(`/note/${id}/chat`)} />
        <IconButton icon="trash-outline" label="Notitie verwijderen" onPress={onDelete} />
        <Button label="Gereed" small variant={focused ? 'primary' : 'secondary'} onPress={onDone} style={{ marginLeft: 4 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: insets.bottom + 48, gap: space.lg }}
      >
        <View style={{ gap: 6 }}>
          <Segmented<AiMode>
            value={mode}
            onChange={(m) => setNoteMode(id, m)}
            options={[
              { value: 'silent', label: 'Stil', icon: MODE_META.silent.icon },
              { value: 'thinking', label: 'Meedenkend', icon: MODE_META.thinking.icon },
            ]}
          />
          <Txt variant="caption" color="faint" style={{ textAlign: 'center' }}>
            {MODE_META[mode].hint}
          </Txt>
        </View>

        <View style={{ gap: space.sm }}>
          <TextInput
            value={note.title}
            onChangeText={(v) => updateNote(id, { title: v.slice(0, 300) })}
            placeholder="Titel"
            placeholderTextColor={c.faint}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => contentRef.current?.focus()}
            onFocus={() => setFocused(true)}
            accessibilityLabel="Titel"
            style={[t.title, { color: c.text, paddingVertical: 4, fontSize: 26 }]}
            multiline={false}
          />
          <TextInput
            ref={contentRef}
            value={note.content}
            onChangeText={(v) => updateNote(id, { content: v.slice(0, 40000) })}
            placeholder="Schrijf je gedachte op…"
            placeholderTextColor={c.faint}
            multiline
            scrollEnabled={false}
            autoFocus={!note.title && !note.content}
            onFocus={() => setFocused(true)}
            accessibilityLabel="Notitie"
            textAlignVertical="top"
            style={[t.body, { color: c.text, minHeight: 180, paddingVertical: 4 }]}
          />
        </View>

        {/* AI-gedeelte: onder de notitie, verandert de tekst nooit. */}
        <View style={{ gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Button
              label="Denk mee"
              icon="sparkles-outline"
              variant="secondary"
              small
              onPress={() => {
                Keyboard.dismiss();
                setFocused(false);
                runAnalysis('manual');
              }}
              disabled={!!busy}
            />
            {busy ? <Thinking /> : null}
          </View>

          {error ? <Banner text={error} tone="danger" icon="alert-circle-outline" onPress={() => setError(null)} /> : null}
          {info ? <Banner text={info} icon="information-circle-outline" onPress={() => setInfo(null)} /> : null}
          {outdated && (showQuestion || showAction) ? (
            <Txt variant="caption" color="faint">
              Gebaseerd op een eerdere versie van je notitie.
            </Txt>
          ) : null}

          {showQuestion ? (
            <FadeIn>
              <Card style={{ gap: space.sm, backgroundColor: c.accentSoft, borderColor: 'transparent' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="help-circle-outline" size={16} color={c.accent} />
                  <Txt variant="caption" color="accent" style={{ fontWeight: '700', flex: 1 }}>
                    VERVOLGVRAAG
                  </Txt>
                  <IconButton icon="close" size={18} color={c.muted} label="Vraag wegklikken" onPress={() => dismiss('question')} />
                </View>
                <Txt variant="callout" selectable>
                  {suggestion!.question}
                </Txt>
                <Button
                  label="Bespreek in chat"
                  icon="chatbubble-ellipses-outline"
                  variant="ghost"
                  small
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                  onPress={() => router.push({ pathname: '/note/[id]/chat', params: { id, q: suggestion!.question ?? '' } })}
                />
              </Card>
            </FadeIn>
          ) : null}

          {showAction ? (
            <FadeIn>
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="footsteps-outline" size={16} color={c.muted} />
                  <Txt variant="caption" color="muted" style={{ fontWeight: '700', flex: 1 }}>
                    MOGELIJKE VERVOLGSTAP
                  </Txt>
                  <IconButton icon="close" size={18} color={c.muted} label="Vervolgstap wegklikken" onPress={() => dismiss('action')} />
                </View>
                <Txt variant="callout" selectable>
                  {suggestion!.proposed_action}
                </Txt>
                <Button
                  label="Opslaan als actie"
                  icon="add-circle-outline"
                  variant="ghost"
                  small
                  loading={savingTask}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                  onPress={actionToTask}
                />
              </Card>
            </FadeIn>
          ) : null}

          {related.length ? (
            <FadeIn style={{ gap: space.sm }}>
              <Txt variant="caption" color="muted" style={{ fontWeight: '700' }}>
                GERELATEERDE NOTITIES
              </Txt>
              {related.map((r) => (
                <Card
                  key={r.id}
                  onPress={() => {
                    tap();
                    router.push(`/note/${r.id}`);
                  }}
                  accessibilityLabel={`Open gerelateerde notitie ${r.title || 'zonder titel'}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderRadius: radius.md }}
                >
                  <Ionicons name="link-outline" size={16} color={c.muted} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="callout" numberOfLines={1} style={{ fontWeight: '600' }}>
                      {r.title.trim() || r.content.trim().split('\n')[0] || 'Naamloze notitie'}
                    </Txt>
                    {r.content.trim() ? (
                      <Txt variant="footnote" color="muted" numberOfLines={1}>
                        {r.content.trim().replace(/\s+/g, ' ')}
                      </Txt>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.faint} />
                </Card>
              ))}
            </FadeIn>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

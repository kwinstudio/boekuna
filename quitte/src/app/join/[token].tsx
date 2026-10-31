import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, Screen, TopBar } from '../../components/ui';
import { t } from '../../lib/i18n';
import { nowIso, uuid } from '../../lib/ids';
import { addJoinedList, enqueue, getState, setProfile, useStore } from '../../lib/store';
import { NotFoundError, fetchState, syncList } from '../../lib/sync';
import { radius, useTheme } from '../../lib/theme';
import type { ListState } from '../../lib/types';

export default function JoinList() {
  const th = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const profileName = useStore((s) => s.profile.name);
  const [state, setState] = useState<ListState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'offline'>('loading');
  const [picked, setPicked] = useState<string | null>(null);
  const [newName, setNewName] = useState(profileName);
  const [addingSelf, setAddingSelf] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const s = await fetchState(String(token));
      // Al lid op dit toestel? Dan direct door.
      const existing = getState().lists[s.list.id];
      if (existing) {
        router.replace(`/list/${s.list.id}`);
        return;
      }
      setState(s);
      setStatus('ready');
      const match = s.members.find((m) => !m.deleted && m.name.trim().toLowerCase() === profileName.trim().toLowerCase());
      if (match) setPicked(match.id);
    } catch (e) {
      setStatus(e instanceof NotFoundError ? 'notfound' : 'offline');
    }
  }, [token, profileName]);

  useEffect(() => {
    load();
  }, [load]);

  const join = () => {
    if (!state) return;
    if (addingSelf) {
      const n = newName.trim();
      if (!n) return;
      const id = uuid();
      addJoinedList(String(token), state, id);
      enqueue(state.list.id, { op: 'member', data: { id, name: n.slice(0, 40), updatedAt: nowIso() }, summary: t('actJoined', { name: n }) });
      setProfile({ name: n });
      syncList(state.list.id);
      router.replace(`/list/${state.list.id}`);
    } else if (picked) {
      addJoinedList(String(token), state, picked);
      const name = state.members.find((m) => m.id === picked)?.name;
      if (name && !profileName) setProfile({ name });
      router.replace(`/list/${state.list.id}`);
    }
  };

  const members = state?.members.filter((m) => !m.deleted) ?? [];

  return (
    <Screen>
      <TopBar backLabel={t('cancel')} onBack={() => router.replace('/')} />
      {status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={th.accent} />
        </View>
      ) : status !== 'ready' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Ionicons name={status === 'notfound' ? 'help-circle-outline' : 'cloud-offline-outline'} size={44} color={th.sub} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: th.text, textAlign: 'center' }}>
            {status === 'notfound' ? t('notFoundTitle') : t('offlineTitle')}
          </Text>
          <Text style={{ fontSize: 16, color: th.sub, textAlign: 'center' }}>{status === 'notfound' ? t('notFoundBody') : t('offlineJoinBody')}</Text>
          <Button label={t('tryAgain')} kind="secondary" onPress={load} style={{ marginTop: 8, alignSelf: 'stretch' }} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 15, color: th.sub }}>{t('joiningList')}</Text>
            <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: th.text, marginBottom: 22 }}>
              {state!.list.name}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: th.text, marginBottom: 10 }}>{t('whoAreYou')}</Text>
            <Card>
              {members.map((m, i) => {
                const sel = !addingSelf && picked === m.id;
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    onPress={() => {
                      setPicked(m.id);
                      setAddingSelf(false);
                    }}
                    style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: th.line }}
                  >
                    <Avatar name={m.name} index={i} />
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{m.name}</Text>
                    <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={22} color={sel ? th.accent : th.border} />
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: addingSelf }}
                onPress={() => setAddingSelf(true)}
                style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={20} color={th.accent} />
                </View>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{t('notInList')}</Text>
                <Ionicons name={addingSelf ? 'radio-button-on' : 'radio-button-off'} size={22} color={addingSelf ? th.accent : th.border} />
              </Pressable>
            </Card>
            {addingSelf ? (
              <TextInput
                accessibilityLabel={t('yourName')}
                value={newName}
                onChangeText={setNewName}
                placeholder={t('yourName')}
                placeholderTextColor={th.sub}
                autoFocus
                maxLength={40}
                style={{ height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 17, color: th.text, marginTop: 12 }}
              />
            ) : null}
          </ScrollView>
          <View style={{ paddingHorizontal: 20 }}>
            <Button label={t('joinCta')} onPress={join} disabled={addingSelf ? !newName.trim() : !picked} />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

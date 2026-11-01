import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, Screen, SectionLabel, TopBar } from '../components/ui';
import { categoryById, guessCategory } from '../lib/categories';
import { money } from '../lib/domain';
import { t } from '../lib/i18n';
import { nowIso, uuid } from '../lib/ids';
import { importCsv, type ImportResult } from '../lib/importer';
import { guessListIcon } from '../lib/look';
import { CURRENCIES } from '../lib/money';
import { createLocalList, enqueue, getState, setProfile, useStore } from '../lib/store';
import { syncList } from '../lib/sync';
import { HUES, radius, useTheme } from '../lib/theme';
import type { Entry } from '../lib/types';

/** Overstappen: een export van Splitwise, Tricount of WieBetaaltWat inlezen als nieuwe lijst. */
export default function ImportScreen() {
  const th = useTheme();
  const profileName = useStore((s) => s.profile.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ImportResult | null>(null);
  const [name, setName] = useState('');
  const [me, setMe] = useState<string | null>(null);

  const pick = async () => {
    setError('');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const file = res.assets[0];
      const text = await (await fetch(file.uri)).text();
      const parsed = importCsv(text);
      if (!parsed || !parsed.entries.length) {
        setError(t('importUnknown'));
        return;
      }
      setData(parsed);
      setName(file.name.replace(/\.(csv|txt)$/i, '').replace(/[_-]+/g, ' ').slice(0, 60));
      const guess = parsed.members.find((m) => m.trim().toLowerCase() === profileName.trim().toLowerCase()) ?? null;
      setMe(guess);
    } catch {
      setError(t('importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!data || !me) return;
    const cur = data.currency && CURRENCIES.includes(data.currency) ? data.currency : 'EUR';
    const others = data.members.filter((m) => m !== me);
    const listName = name.trim() || t('importDefaultName');
    const id = createLocalList(listName.slice(0, 80), cur, me, others, { color: HUES[Math.floor(Math.random() * HUES.length)], icon: guessListIcon(listName) });
    setProfile({ name: profileName || me });
    const local = getState().lists[id];
    const byName = new Map(local.base.members.map((m) => [m.name.trim().toLowerCase(), m.id]));
    const idOf = (n: string) => byName.get(n.trim().toLowerCase())!;
    const ts = nowIso();
    const entries: Entry[] = data.entries.map((e) => ({
      id: uuid(),
      kind: e.kind,
      title: e.title.slice(0, 120),
      amount: e.amount,
      category: e.kind === 'transfer' ? null : e.category && categoryById(e.category).id !== 'other' ? e.category : guessCategory(e.title),
      date: e.date,
      payers: e.payers.map((p) => ({ m: idOf(p.name), a: p.a })),
      shares: e.shares.map((p) => ({ m: idOf(p.name), a: p.a })),
      splitMode: 'amounts',
      createdBy: local.me,
      updatedBy: local.me,
      updatedAt: ts,
    }));
    enqueue(
      id,
      entries.map((e, i) => ({ op: 'entry' as const, data: e, summary: i === 0 ? t('actImported', { n: entries.length }) : undefined })),
    );
    syncList(id);
    router.replace({ pathname: '/list/[id]', params: { id, fresh: '1' } });
  };

  const total = data ? data.entries.filter((e) => e.kind === 'expense').reduce((x, e) => x + e.amount, 0) : 0;
  const field = { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 17, color: th.text } as const;

  return (
    <Screen>
      <TopBar backLabel={t('cancel')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: th.text }}>
            {t('importTitle')}
          </Text>
          <Text style={{ fontSize: 16, lineHeight: 23, color: th.sub, marginTop: 6, marginBottom: 18 }}>{t('importBody')}</Text>

          {!data ? (
            <>
              <Card style={{ padding: 16, gap: 12 }}>
                {(['importStep1', 'importStep2', 'importStep3'] as const).map((k, i) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: th.accentText }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: th.text }}>{t(k)}</Text>
                  </View>
                ))}
              </Card>
              <Text style={{ fontSize: 13, color: th.sub, marginTop: 10, lineHeight: 18 }}>{t('importApps')}</Text>
              {error ? <Text style={{ color: th.danger, fontSize: 14, marginTop: 12 }}>{error}</Text> : null}
              {busy ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
            </>
          ) : (
            <>
              <Card style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="document-text-outline" size={26} color={th.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>{t('importFound', { n: data.entries.length })}</Text>
                  <Text style={{ fontSize: 14, color: th.sub }}>
                    {t('togetherSpent')}: {money(total, data.currency && CURRENCIES.includes(data.currency) ? data.currency : 'EUR')}
                    {data.skipped ? ` · ${t('importSkipped', { n: data.skipped })}` : ''}
                  </Text>
                </View>
              </Card>
              <SectionLabel>{t('listName')}</SectionLabel>
              <TextInput accessibilityLabel={t('listName')} value={name} onChangeText={setName} maxLength={80} style={field} />
              <SectionLabel>{t('whoAreYou')}</SectionLabel>
              <Card>
                {data.members.map((m, i) => {
                  const sel = me === m;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: sel }}
                      onPress={() => setMe(m)}
                      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: i < data.members.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: th.line }}
                    >
                      <Avatar name={m} />
                      <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{m}</Text>
                      <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={sel ? th.accent : th.border} />
                    </Pressable>
                  );
                })}
              </Card>
              <Text style={{ fontSize: 13, color: th.sub, marginTop: 10, lineHeight: 18 }}>{t('importAfter')}</Text>
            </>
          )}
        </ScrollView>
        <View style={{ paddingHorizontal: 20 }}>
          {data ? (
            <Button label={t('importCreate')} onPress={create} disabled={!me} />
          ) : (
            <Button label={t('importPick')} icon="folder-open-outline" onPress={pick} loading={busy} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, Card, MODE_META, Segmented, Txt } from '../../components/ui';
import { deleteMyData, setThemePref, signOut, updateProfile, useStore } from '../../lib/store';
import { space, useColors } from '../../lib/theme';
import type { AiMode, ThemePref } from '../../lib/types';

function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="caption" color="muted" style={{ fontWeight: '700', paddingHorizontal: space.xs }}>
        {title.toUpperCase()}
      </Txt>
      <Card style={{ gap: space.md }}>{children}</Card>
      {footer ? (
        <Txt variant="footnote" color="faint" style={{ paddingHorizontal: space.xs }}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}

function ask(title: string, message: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Annuleren', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const profile = useStore((s) => s.profile);
  const email = useStore((s) => s.email);
  const themePref = useStore((s) => s.themePref);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function change(patch: Parameters<typeof updateProfile>[0]) {
    setError(null);
    const ok = await updateProfile(patch);
    if (!ok) setError('Opslaan lukte niet. Controleer je verbinding.');
  }

  async function onDeleteData() {
    const ok = await ask(
      'Al je DenkNote-gegevens verwijderen?',
      'Alle notities, AI-gesprekken, suggesties en acties worden definitief verwijderd. Je account blijft bestaan.',
      'Alles verwijderen',
    );
    if (!ok) return;
    setDeleting(true);
    const res = await deleteMyData();
    setDeleting(false);
    if (res) setDone('Je gegevens zijn verwijderd.');
    else setError('Verwijderen lukte niet. Controleer je verbinding en probeer het opnieuw.');
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: 48, gap: space.xl }}>
      <Txt variant="largeTitle" accessibilityRole="header">
        Instellingen
      </Txt>
      {error ? <Banner text={error} tone="danger" icon="alert-circle-outline" onPress={() => setError(null)} /> : null}
      {done ? <Banner text={done} tone="accent" icon="checkmark-circle-outline" onPress={() => setDone(null)} /> : null}

      <Section title="AI" footer={MODE_META[profile.default_ai_mode].hint + ' Je kunt de modus per notitie aanpassen.'}>
        <Txt variant="callout" style={{ fontWeight: '600' }}>
          Standaardmodus voor nieuwe notities
        </Txt>
        <Segmented<AiMode>
          value={profile.default_ai_mode}
          onChange={(v) => change({ default_ai_mode: v })}
          options={[
            { value: 'silent', label: 'Stil', icon: MODE_META.silent.icon },
            { value: 'thinking', label: 'Meedenkend', icon: MODE_META.thinking.icon },
          ]}
        />
      </Section>

      <Section
        title="Verbanden"
        footer="Als dit aan staat, maakt DenkNote op de server een vectorrepresentatie van je notities (via OpenAI) om verwante eigen notities te vinden. Andere gebruikers zien nooit iets van jou."
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="callout" style={{ fontWeight: '600' }}>
              Verbanden met andere notities
            </Txt>
            <Txt variant="footnote" color="muted">
              De AI mag je andere notities gebruiken als context en verwante notities tonen.
            </Txt>
          </View>
          <Switch
            value={profile.allow_related}
            onValueChange={(v) => change({ allow_related: v })}
            trackColor={{ true: c.accent, false: c.surfaceAlt }}
            accessibilityLabel="Verbanden met andere notities toestaan"
          />
        </View>
      </Section>

      <Section title="Weergave">
        <Segmented<ThemePref>
          value={themePref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: 'Systeem' },
            { value: 'light', label: 'Licht' },
            { value: 'dark', label: 'Donker' },
          ]}
        />
      </Section>

      <Section title="Account">
        <View style={{ gap: 2 }}>
          <Txt variant="footnote" color="muted">
            Ingelogd als
          </Txt>
          <Txt variant="callout" selectable>
            {email ?? '—'}
          </Txt>
        </View>
        <Button label="Uitloggen" variant="secondary" icon="log-out-outline" onPress={() => signOut()} />
      </Section>

      <Section title="Gegevens">
        <Txt variant="footnote" color="muted">
          Verwijder al je notities, AI-gesprekken, suggesties en acties uit DenkNote.
        </Txt>
        <Button label="Mijn gegevens verwijderen" variant="danger" icon="trash-outline" loading={deleting} onPress={onDeleteData} />
      </Section>

      <Txt variant="caption" color="faint" style={{ textAlign: 'center' }}>
        DenkNote {Constants.expoConfig?.version ?? ''}
      </Txt>
    </ScrollView>
  );
}

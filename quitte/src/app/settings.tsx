import Constants from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Card, Screen, SectionLabel, TopBar } from '../components/ui';
import { t } from '../lib/i18n';
import { setProfile, useStore } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function Settings() {
  const th = useTheme();
  const profile = useStore((s) => s.profile);
  const [name, setName] = useState(profile.name);
  const [iban, setIban] = useState(profile.iban);
  const field = { height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 17, color: th.text } as const;

  return (
    <Screen>
      <TopBar backLabel={t('back')} title={t('settings')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <SectionLabel>{t('yourName')}</SectionLabel>
          <TextInput
            accessibilityLabel={t('yourName')}
            value={name}
            onChangeText={setName}
            onEndEditing={() => setProfile({ name: name.trim() })}
            maxLength={40}
            style={field}
          />
          <SectionLabel>{t('defaultIban')}</SectionLabel>
          <TextInput
            accessibilityLabel={t('defaultIban')}
            value={iban}
            onChangeText={setIban}
            onEndEditing={() => setProfile({ iban: iban.trim().toUpperCase() })}
            autoCapitalize="characters"
            placeholder="NL00 BANK 0123 4567 89"
            placeholderTextColor={th.sub}
            maxLength={40}
            style={field}
          />
          <Text style={{ fontSize: 13, color: th.sub, marginTop: 6 }}>{t('defaultIbanHint')}</Text>

          <SectionLabel>{t('about')}</SectionLabel>
          <Card style={{ padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: th.text }}>Quitte {Constants.expoConfig?.version ?? ''}</Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: th.sub }}>{t('aboutBody')}</Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: th.sub }}>{t('privacyBody')}</Text>
          </Card>
          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

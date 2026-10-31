import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { showToast } from '../components/Toast';
import { Button } from '../components/ui';
import { enableBackup, restoreBackup, setMonthlyDigest } from '../lib/extras';
import { timeLabel } from '../lib/i18n';
import { Card, Screen, SectionLabel, TopBar } from '../components/ui';
import { t } from '../lib/i18n';
import { setProfile, useStore } from '../lib/store';
import { radius, useTheme } from '../lib/theme';

export default function Settings() {
  const th = useTheme();
  const profile = useStore((s) => s.profile);
  const [name, setName] = useState(profile.name);
  const [iban, setIban] = useState(profile.iban);
  const [payLink, setPayLink] = useState(profile.payLink ?? '');
  const [busy, setBusy] = useState(false);
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
          <SectionLabel>{t('payLink')}</SectionLabel>
          <TextInput
            accessibilityLabel={t('payLink')}
            value={payLink}
            onChangeText={setPayLink}
            onEndEditing={() => {
              const v = payLink.trim();
              if (v && !/^https:\/\/\S+$/i.test(v)) return Alert.alert(t('payLinkInvalid'));
              setProfile({ payLink: v });
            }}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://tikkie.me/…"
            placeholderTextColor={th.sub}
            maxLength={300}
            style={field}
          />
          <Text style={{ fontSize: 13, color: th.sub, marginTop: 6 }}>{t('payLinkHint')}</Text>

          <SectionLabel>{t('notifications')}</SectionLabel>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60 }}>
            <View style={{ flex: 1, paddingVertical: 10 }}>
              <Text style={{ fontSize: 16, color: th.text }}>{t('monthlyToggle')}</Text>
              <Text style={{ fontSize: 13, color: th.sub }}>{t('monthlyToggleHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('monthlyToggle')}
              value={!!profile.monthlyDigest}
              onValueChange={async (v) => {
                const ok = await setMonthlyDigest(v).catch(() => false);
                if (!ok && v) Alert.alert(t('notifDenied'));
              }}
            />
          </Card>

          {Platform.OS === 'ios' ? (
            <>
              <SectionLabel>{t('backup')}</SectionLabel>
              <Card style={{ padding: 16, gap: 10 }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: th.sub }}>
                  {profile.backupKey ? t('backupOn', { time: profile.backupAt ? timeLabel(new Date(profile.backupAt).toISOString()) : '—' }) : t('backupBody')}
                </Text>
                {!profile.backupKey ? (
                  <Button
                    label={t('backupCta')}
                    icon="logo-apple"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      const ok = await enableBackup().catch(() => false);
                      setBusy(false);
                      showToast(ok ? t('backupDone') : t('backupFailed'));
                    }}
                  />
                ) : null}
                <Button
                  label={t('restoreCta')}
                  kind="secondary"
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    const n = await restoreBackup().catch(() => null);
                    setBusy(false);
                    showToast(n ? t('restoredLists', { n }) : t('restoreNone'));
                  }}
                />
              </Card>
            </>
          ) : null}

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

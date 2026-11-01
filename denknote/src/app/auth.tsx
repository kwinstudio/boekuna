import * as Linking from 'expo-linking';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner, Button, IconButton, Segmented, Txt } from '../components/ui';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { radius, space, type as t, useColors } from '../lib/theme';

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'E-mailadres of wachtwoord klopt niet.';
  if (m.includes('email not confirmed')) return 'Bevestig eerst je e-mailadres via de link in je mail.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Er bestaat al een account met dit e-mailadres. Log in.';
  if (m.includes('password')) return 'Kies een wachtwoord van minimaal 8 tekens.';
  if (m.includes('rate') || m.includes('too many')) return 'Te veel pogingen. Wacht even en probeer het opnieuw.';
  if (m.includes('network') || m.includes('fetch')) return 'Geen verbinding. Controleer je internet.';
  return 'Dat lukte niet. Probeer het opnieuw.';
}

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.mode === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pwRef = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const c = useColors();
  const signedIn = useStore((s) => !!s.userId);
  if (signedIn) return <Redirect href="/notes" />;

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pwOk = password.length >= 8;

  async function submit() {
    setError(null);
    setInfo(null);
    if (!emailOk) return setError('Vul een geldig e-mailadres in.');
    if (!pwOk) return setError('Je wachtwoord moet minimaal 8 tekens hebben.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) setError(friendlyAuthError(e.message));
      } else {
        const { data, error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: Linking.createURL('auth-callback') },
        });
        if (e) setError(friendlyAuthError(e.message));
        else if (!data.session) {
          setInfo('Check je mail en bevestig je e-mailadres. Daarna kun je hier inloggen.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(friendlyAuthError(String((e as Error)?.message ?? e)));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    ...t.body,
    color: c.text,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: space.lg,
    minHeight: 52,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl, gap: space.lg }}
      >
        <View style={{ marginLeft: -space.sm }}>
          <IconButton icon="chevron-back" label="Terug" onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
        </View>
        <Txt variant="largeTitle">{mode === 'signup' ? 'Account aanmaken' : 'Welkom terug'}</Txt>
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          options={[
            { value: 'signup', label: 'Registreren' },
            { value: 'signin', label: 'Inloggen' },
          ]}
        />
        <View style={{ gap: space.md }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-mailadres"
            placeholderTextColor={c.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
            accessibilityLabel="E-mailadres"
            style={inputStyle}
          />
          <TextInput
            ref={pwRef}
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'Wachtwoord (min. 8 tekens)' : 'Wachtwoord'}
            placeholderTextColor={c.faint}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            accessibilityLabel="Wachtwoord"
            style={inputStyle}
          />
        </View>
        {error ? <Banner text={error} tone="danger" icon="alert-circle-outline" /> : null}
        {info ? <Banner text={info} tone="accent" icon="mail-outline" /> : null}
        <Button label={mode === 'signup' ? 'Account aanmaken' : 'Inloggen'} onPress={submit} loading={busy} disabled={!email || !password} />
        <Txt variant="footnote" color="faint" style={{ textAlign: 'center' }}>
          Je notities zijn alleen voor jou zichtbaar.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

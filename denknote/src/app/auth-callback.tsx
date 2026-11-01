// Landingsplek voor de bevestigingslink uit de registratiemail (denknote://auth-callback?code=…).
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Thinking } from '../components/ui';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { space } from '../lib/theme';

export default function AuthCallback() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(error_description ? 'De link is ongeldig of verlopen.' : null);
  const signedIn = useStore((s) => !!s.userId);

  useEffect(() => {
    if (!code || signedIn) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error: e }) => {
      if (e) setError('Bevestigen lukte niet op dit toestel. Log in met je e-mailadres en wachtwoord.');
    });
  }, [code, signedIn]);

  if (signedIn) return <Redirect href="/notes" />;
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      {error ? (
        <>
          <Banner text={error} tone="danger" icon="alert-circle-outline" />
          <Button label="Naar inloggen" onPress={() => router.replace({ pathname: '/auth', params: { mode: 'signin' } })} />
        </>
      ) : (
        <Thinking label="Bezig met bevestigen…" />
      )}
    </View>
  );
}

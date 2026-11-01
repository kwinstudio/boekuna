import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FadeIn, Txt, type IconName } from '../components/ui';
import { setOnboarded, useStore } from '../lib/store';
import { radius, space, useColors } from '../lib/theme';

function ModeCard({ icon, title, body, accent }: { icon: IconName; title: string; body: string; accent?: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accent ? c.accentSoft : c.surfaceAlt,
        }}
      >
        <Ionicons name={icon} size={18} color={accent ? c.accent : c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="callout" color="muted">
          {body}
        </Txt>
      </View>
    </View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const signedIn = useStore((s) => !!s.userId);
  if (signedIn) return <Redirect href="/notes" />;

  const go = (mode: 'signup' | 'signin') => {
    setOnboarded();
    router.push({ pathname: '/auth', params: { mode } });
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 56,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
        justifyContent: 'space-between',
        gap: space.xxl,
      }}
    >
      <FadeIn style={{ gap: space.md }}>
        <Txt variant="caption" color="accent" style={{ fontWeight: '700', letterSpacing: 1.2 }}>
          DENKNOTE
        </Txt>
        <Txt variant="largeTitle">Schrijf. Denk verder.</Txt>
        <Txt variant="body" color="muted">
          Een rustige plek voor je ideeën, met een denkpartner die alleen meepraat wanneer jij dat wilt.
        </Txt>
      </FadeIn>

      <FadeIn style={{ gap: space.md }}>
        <ModeCard
          icon="moon-outline"
          title="Stille modus"
          body="Je schrijft ongestoord. De AI reageert pas als je op ‘Denk mee’ drukt."
        />
        <ModeCard
          icon="sparkles-outline"
          title="Meedenkende modus"
          body="Druk op ‘Gereed’ en je krijgt één goede vraag, een eerste stap en verwante notities."
          accent
        />
        <Txt variant="footnote" color="faint" style={{ paddingHorizontal: space.xs }}>
          Je kiest de modus per notitie. De AI past je tekst nooit zelf aan.
        </Txt>
      </FadeIn>

      <View style={{ gap: space.sm }}>
        <Button label="Account aanmaken" onPress={() => go('signup')} />
        <Button label="Ik heb al een account" variant="ghost" onPress={() => go('signin')} />
      </View>
    </ScrollView>
  );
}

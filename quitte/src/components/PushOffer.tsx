import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { t } from '../lib/i18n';
import { setPush, snoozePushOffer } from '../lib/push';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme';
import { showToast } from './Toast';

/** Zachte voorvraag vóór de iOS-toestemming: pas tonen als er echt iemand anders in de lijst zit. */
export function PushOffer({ show }: { show: boolean }) {
  const th = useTheme();
  const pushOn = useStore((s) => s.profile.pushOn);
  const askedAt = useStore((s) => s.profile.pushAskedAt);
  const snoozed = !!askedAt && Date.now() - askedAt < 14 * 864e5;
  if (!show || Platform.OS !== 'ios' || pushOn !== undefined || snoozed) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: th.card, marginBottom: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: th.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="notifications" size={18} color={th.onAccent} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: th.text }}>{t('pushOfferTitle')}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: th.sub }}>{t('pushOfferBody')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              const ok = await setPush(true).catch(() => false);
              if (ok) showToast(t('pushOn'));
              else Alert.alert(t('notifDenied'));
            }}
            style={({ pressed }) => [{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: th.accent, justifyContent: 'center' }, pressed && { opacity: 0.8 }]}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.onAccent }}>{t('pushOfferYes')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={snoozePushOffer} style={{ height: 34, paddingHorizontal: 10, justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.sub }}>{t('pushOfferNo')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

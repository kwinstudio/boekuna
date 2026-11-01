import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';
import { t } from '../lib/i18n';
import { useTheme } from '../lib/theme';

const KEYS = ['1', '2', '3', '+', '4', '5', '6', '−', '7', '8', '9', '×', ',', '0', 'back', '='];
const OPS = ['+', '−', '×', '='];

export function Keypad({ onKey, compact }: { onKey: (k: string) => void; compact?: boolean }) {
  const th = useTheme();
  const h = compact ? 44 : 50;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {KEYS.map((k) => {
        const plain = k === ',' || k === 'back';
        const op = OPS.includes(k);
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === 'back' ? t('erase') : k === ',' ? t('comma') : k === '+' ? t('plus') : k === '−' ? t('minus') : k === '×' ? t('times') : k === '=' ? t('equals') : k}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onKey(k);
            }}
            style={({ pressed }) => ({
              width: '23%',
              flexGrow: 1,
              height: h,
              borderRadius: 12,
              backgroundColor: pressed ? th.segment : plain ? 'transparent' : op ? th.segment : th.card,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {k === 'back' ? (
              <Ionicons name="backspace-outline" size={24} color={th.text} />
            ) : (
              <Text style={{ fontSize: 22, fontWeight: op ? '600' : '500', color: op ? th.accent : th.text }}>{k}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

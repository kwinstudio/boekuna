import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { t } from '../lib/i18n';
import { HUES, LIST_ICONS } from '../lib/look';
import { usePalette, useTheme, type Hue } from '../lib/theme';
import { Button } from './ui';

type IconName = (typeof LIST_ICONS)[number];

/** Gekleurd icoontegeltje van een lijst. */
export function ListBadge({ hue, icon, size = 44 }: { hue: Hue; icon: IconName; size?: number }) {
  const p = usePalette(hue);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.52} color={p.fg} />
    </View>
  );
}

function Dot({ hue, selected, onPress }: { hue: Hue; selected: boolean; onPress: () => void }) {
  const p = usePalette(hue);
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={t(`hue_${hue}` as never)}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: selected ? p.strong : 'transparent' }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.strong, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <Ionicons name="checkmark" size={18} color={th.bg} /> : null}
      </View>
    </Pressable>
  );
}

export function LookPicker({
  visible,
  hue,
  icon,
  onChange,
  onClose,
}: {
  visible: boolean;
  hue: Hue;
  icon: IconName;
  onChange: (v: { hue: Hue; icon: IconName }) => void;
  onClose: () => void;
}) {
  const th = useTheme();
  const p = usePalette(hue);
  const pick = (v: { hue: Hue; icon: IconName }) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(v);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24 }}>
          <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: th.text, marginBottom: 18 }}>
            {t('lookTitle')}
          </Text>
          <View style={{ alignItems: 'center', marginBottom: 22 }}>
            <ListBadge hue={hue} icon={icon} size={84} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, marginBottom: 8 }}>{t('lookColor')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {HUES.map((h) => (
              <Dot key={h} hue={h} selected={h === hue} onPress={() => pick({ hue: h, icon })} />
            ))}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: th.sub, marginBottom: 8 }}>{t('lookIcon')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {LIST_ICONS.map((ic) => {
              const sel = ic === icon;
              return (
                <Pressable
                  key={ic}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={ic.replace('-outline', '')}
                  onPress={() => pick({ hue, icon: ic })}
                  style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? p.bg : th.card, borderWidth: 2, borderColor: sel ? p.strong : 'transparent' }}
                >
                  <Ionicons name={ic} size={26} color={sel ? p.fg : th.text} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={{ padding: 20, paddingBottom: 34 }}>
          <Button label={t('done')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

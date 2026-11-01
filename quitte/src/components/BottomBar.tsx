import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef } from 'react';
import { ActionSheetIOS, Alert, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../lib/i18n';
import { getState, viewOf } from '../lib/store';
import { useTheme } from '../lib/theme';

/** Grote +: snel een uitgave in een recente lijst, of een nieuwe lijst / meedoen. */
function plusMenu() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const recent = Object.values(getState().lists)
    .filter((l) => !viewOf(l)?.list.archived)
    .sort((a, b) => (b.lastSyncAt ?? b.joinedAt) - (a.lastSyncAt ?? a.joinedAt))
    .slice(0, 4);
  const go = (i: number) => {
    if (i < recent.length) router.push({ pathname: '/list/[id]/entry', params: { id: recent[i].id } });
    else if (i === recent.length) router.push('/new');
    else if (i === recent.length + 1) router.push('/join');
    else if (i === recent.length + 2) router.push('/import');
  };
  const opts = [...recent.map((r) => t('addExpenseTo', { name: viewOf(r)?.list.name ?? '' })), t('newList'), t('joinWithCode'), t('importCta'), t('cancel')];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, title: t('whatToAdd') }, (i) => go(i));
  } else {
    Alert.alert(t('whatToAdd'), undefined, [...opts.slice(0, -1).map((o, i) => ({ text: o, onPress: () => go(i) })), { text: t('cancel'), style: 'cancel' as const }]);
  }
}

/** Vaste onderbalk: Lijsten · grote + · Activiteit. */
export function BottomBar({ active }: { active: 'lists' | 'activity' }) {
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const item = (key: 'lists' | 'activity', icon: 'albums' | 'notifications', label: string, onPress: () => void) => {
    const on = active === key;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={label}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 56, gap: 2 }}
      >
        <Ionicons name={on ? icon : (`${icon}-outline` as const)} size={24} color={on ? th.accent : th.sub} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: on ? th.accent : th.sub }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, 10),
        backgroundColor: th.bg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: th.line,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {item('lists', 'albums', t('lists'), () => active !== 'lists' && router.replace('/'))}
      <View style={{ width: 88, alignItems: 'center' }}>
        <PlusButton onPress={plusMenu} />
      </View>
      {item('activity', 'notifications', t('activityTab'), () => active !== 'activity' && router.replace('/activity'))}
    </View>
  );
}

function PlusButton({ onPress }: { onPress: () => void }) {
  const th = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: to === 1 ? 10 : 0 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: -26 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('add')}
        onPressIn={() => spring(0.9)}
        onPressOut={() => spring(1)}
        onPress={onPress}
        style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: th.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: th.bg }}
      >
        <Ionicons name="add" size={32} color={th.onInk} />
      </Pressable>
    </Animated.View>
  );
}


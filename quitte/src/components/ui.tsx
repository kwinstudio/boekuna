import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { radius, useTheme, useTint } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, style, bottom = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; bottom?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 6, paddingBottom: bottom ? Math.max(insets.bottom, 16) : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function TopBar({
  backLabel,
  onBack,
  title,
  right,
}: {
  backLabel?: string;
  onBack?: () => void;
  title?: string;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.topbar}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {backLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={8}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="chevron-back" size={24} color={t.accent} style={{ marginLeft: -6 }} />
            <Text numberOfLines={1} style={[styles.backText, { color: t.accent }]}>{backLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {title ? (
        <Text style={[styles.topTitle, { color: t.text }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>{right}</View>
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  filled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  filled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size === 44 ? 22 : radius.button,
          borderWidth: filled || size === 44 ? 0 : 1,
          borderColor: t.border,
          backgroundColor: filled ? t.accentSoft : size === 44 ? 'transparent' : t.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name={icon} size={size > 48 ? 24 : 23} color={filled || size === 44 ? t.accent : t.text} />
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.card : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? t.danger : kind === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: kind === 'ghost' || kind === 'danger' ? 46 : 50,
          borderRadius: radius.button,
          backgroundColor: bg,
          borderWidth: kind === 'secondary' ? 1 : 0,
          borderColor: t.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 16,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: kind === 'ghost' || kind === 'danger' ? 16 : 17, fontWeight: '600' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: t.segment }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, active && { backgroundColor: t.card }]}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: active ? t.text : t.sub }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const avatarTints = ['teal', 'blue', 'sand', 'plum', 'green'];

export function Avatar({ name, index, size = 36, dim }: { name: string; index: number; size?: number; dim?: boolean }) {
  const tint = useTint(dim ? 'gray' : avatarTints[index % avatarTints.length]);
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: tint.fg, fontWeight: '700', fontSize: size * 0.4 }}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

export function CategoryIcon({ icon, tint, size = 40 }: { icon: IconName; tint: string; size?: number }) {
  const c = useTint(tint);
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={c.fg} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.card }, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, fontWeight: '600', color: t.sub, paddingTop: 16, paddingBottom: 6, paddingHorizontal: 2 }}>{children}</Text>;
}

export function Row({
  label,
  value,
  onPress,
  icon,
  danger,
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: IconName;
  danger?: boolean;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
        pressed && { opacity: 0.6 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={danger ? t.danger : t.sub} /> : null}
      <Text style={{ flex: 1, fontSize: 16, color: danger ? t.danger : t.text }}>{label}</Text>
      {value ? (
        <Text style={{ fontSize: 16, color: t.sub, maxWidth: '55%' }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={18} color={t.sub} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 },
  back: { flexDirection: 'row', alignItems: 'center', height: 44 },
  backText: { fontSize: 16, fontWeight: '600' },
  topTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  segment: { flexDirection: 'row', borderRadius: 9, padding: 2, gap: 2 },
  segItem: { flex: 1, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});

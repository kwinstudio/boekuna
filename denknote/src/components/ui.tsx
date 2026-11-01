import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radius, space, type as t, useColors } from '../lib/theme';
import type { AiMode } from '../lib/types';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tap() {
  if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {});
}

export function Txt({
  style,
  variant = 'body',
  color,
  children,
  numberOfLines,
  selectable,
  accessibilityRole,
}: {
  style?: StyleProp<TextStyle>;
  variant?: keyof typeof t;
  color?: 'text' | 'muted' | 'faint' | 'accent' | 'danger' | 'onPrimary';
  children: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
  accessibilityRole?: 'header' | 'text';
}) {
  const c = useColors();
  return (
    <Text
      accessibilityRole={accessibilityRole}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[t[variant], { color: c[color ?? 'text'] }, style]}
      maxFontSizeMultiplier={1.6}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, onLongPress, accessibilityLabel }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: space.lg,
  };
  if (!onPress && !onLongPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, style, pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primary, fg: c.onPrimary, border: 'transparent' },
    accent: { bg: c.accent, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.surface, fg: c.text, border: c.borderStrong },
    ghost: { bg: 'transparent', fg: c.text, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: small ? 36 : 50,
          paddingHorizontal: small ? space.md : space.xl,
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: off ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : icon ? (
        <Ionicons name={icon} size={small ? 16 : 18} color={palette.fg} />
      ) : null}
      <Text style={[small ? t.footnote : t.headline, { color: palette.fg, fontWeight: '600' }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.55 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={[{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 3 }, style]}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (!active) {
                tap();
                onChange(o.value);
              }
            }}
            style={{
              flex: 1,
              minHeight: 34,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              backgroundColor: active ? c.surface : 'transparent',
              shadowColor: '#000',
              shadowOpacity: active ? 0.06 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            {o.icon ? <Ionicons name={o.icon} size={14} color={active ? c.text : c.muted} /> : null}
            <Text style={[t.footnote, { fontWeight: '600', color: active ? c.text : c.muted }]} maxFontSizeMultiplier={1.3}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: space.md,
        minHeight: 36,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.borderStrong,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={c.accent} /> : null}
      <Text style={[t.footnote, { color: c.text, fontWeight: '500' }]}>{label}</Text>
    </Pressable>
  );
}

export const MODE_META: Record<AiMode, { label: string; icon: IconName; hint: string }> = {
  silent: { label: 'Stil', icon: 'moon-outline', hint: 'AI reageert alleen als je op Denk mee drukt.' },
  thinking: { label: 'Meedenkend', icon: 'sparkles-outline', hint: 'AI denkt mee nadat je op Gereed drukt.' },
};

export function ModeBadge({ mode }: { mode: AiMode }) {
  const c = useColors();
  const m = MODE_META[mode];
  const on = mode === 'thinking';
  return (
    <View
      accessibilityLabel={`AI-modus: ${m.label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        height: 22,
        borderRadius: radius.pill,
        backgroundColor: on ? c.accentSoft : c.surfaceAlt,
      }}
    >
      <Ionicons name={m.icon} size={11} color={on ? c.accent : c.muted} />
      <Text style={[t.caption, { color: on ? c.accent : c.muted, fontWeight: '600' }]}>{m.label}</Text>
    </View>
  );
}

/** Rustige laadindicator: drie stippen die zacht oplichten. */
export function Thinking({ label = 'Denkt na…' }: { label?: string }) {
  const c = useColors();
  const v = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const anims = v.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(a, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.3, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [v]);
  return (
    <View accessibilityLabel={label} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {v.map((a, i) => (
          <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, opacity: a }} />
        ))}
      </View>
      <Text style={[t.footnote, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View
      style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

export function Banner({ text, tone = 'muted', icon, onPress }: {
  text: string;
  tone?: 'muted' | 'danger' | 'accent';
  icon?: IconName;
  onPress?: () => void;
}) {
  const c = useColors();
  const bg = tone === 'danger' ? c.dangerSoft : tone === 'accent' ? c.accentSoft : c.surfaceAlt;
  const fg = tone === 'danger' ? c.danger : tone === 'accent' ? c.accent : c.muted;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: bg, borderRadius: radius.md, padding: space.md }}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[t.footnote, { color: fg, flex: 1 }]}>{text}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <FadeIn style={{ alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: 56, gap: space.md }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={24} color={c.muted} />
      </View>
      <Txt variant="headline" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt variant="callout" color="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {body}
      </Txt>
      {children}
    </FadeIn>
  );
}

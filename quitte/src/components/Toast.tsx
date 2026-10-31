import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

type ToastState = { id: number; text: string; action?: string; onAction?: () => void } | null;

let current: ToastState = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function set(v: ToastState) {
  current = v;
  subs.forEach((s) => s());
}

export function showToast(text: string, action?: string, onAction?: () => void, ms = 6000) {
  if (timer) clearTimeout(timer);
  set({ id: Date.now(), text, action, onAction });
  timer = setTimeout(() => set(null), ms);
}

export function hideToast() {
  if (timer) clearTimeout(timer);
  set(null);
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
  useEffect(() => () => hideToast(), []);
  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 16) + 76 }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          backgroundColor: t.toast,
          borderRadius: 14,
          minHeight: 52,
          paddingLeft: 16,
          paddingRight: 6,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: t.toastText, fontSize: 15, flex: 1, paddingVertical: 12 }}>{toast.text}</Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.onAction?.();
              hideToast();
            }}
            style={{ height: 44, justifyContent: 'center', paddingHorizontal: 10 }}
          >
            <Text style={{ color: t.toastAction, fontSize: 15, fontWeight: '700' }}>{toast.action}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

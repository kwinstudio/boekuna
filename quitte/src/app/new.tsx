import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Screen, TopBar } from '../components/ui';
import { t } from '../lib/i18n';
import { CURRENCIES } from '../lib/money';
import { createLocalList, setProfile, useStore } from '../lib/store';
import { syncList } from '../lib/sync';
import { radius, useTheme } from '../lib/theme';


export default function NewList() {
  const th = useTheme();
  const profile = useStore((s) => s.profile);
  const [name, setName] = useState('');
  const [me, setMe] = useState(profile.name);
  const [others, setOthers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [pickCurrency, setPickCurrency] = useState(false);
  const [error, setError] = useState('');
  const draftRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const addDraft = () => {
    const n = draft.trim();
    if (!n) return;
    if (others.some((o) => o.toLowerCase() === n.toLowerCase()) || n.toLowerCase() === me.trim().toLowerCase()) {
      setError(t('nameTaken'));
      return;
    }
    setOthers((o) => [...o, n.slice(0, 40)]);
    setDraft('');
    setError('');
    draftRef.current?.focus();
  };

  const create = () => {
    const all = draft.trim() ? [...others, draft.trim()] : others;
    if (!name.trim()) return setError(t('errListName'));
    if (!me.trim()) return setError(t('errYourName'));
    setProfile({ name: me.trim() });
    const id = createLocalList(name.slice(0, 80), currency, me.slice(0, 40), all);
    syncList(id);
    router.replace(`/list/${id}`);
  };

  const field = {
    height: 52,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: th.border,
    backgroundColor: th.field,
    paddingHorizontal: 16,
    fontSize: 17,
    color: th.text,
  } as const;

  return (
    <Screen>
      <TopBar backLabel={t('cancel')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: th.text, marginBottom: 6 }}>
            {t('newList')}
          </Text>
          <Text style={{ fontSize: 16, color: th.sub, marginBottom: 24 }}>{t('newListSub')}</Text>

          <Text nativeID="lblName" style={{ fontSize: 14, fontWeight: '600', color: th.text, marginBottom: 8 }}>
            {t('whatFor')}
          </Text>
          <TextInput
            accessibilityLabelledBy="lblName"
            accessibilityLabel={t('whatFor')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError('');
            }}
            placeholder={t('whatForPlaceholder')}
            placeholderTextColor={th.sub}
            style={[field, { marginBottom: 20 }]}
            autoFocus
            returnKeyType="next"
            maxLength={80}
          />

          <Text style={{ fontSize: 14, fontWeight: '600', color: th.text, marginBottom: 8 }}>{t('yourName')}</Text>
          <TextInput
            accessibilityLabel={t('yourName')}
            value={me}
            onChangeText={setMe}
            placeholder={t('yourNamePlaceholder')}
            placeholderTextColor={th.sub}
            style={[field, { marginBottom: 20 }]}
            autoComplete="given-name"
            textContentType="givenName"
            maxLength={40}
          />

          <Text style={{ fontSize: 14, fontWeight: '600', color: th.text, marginBottom: 10 }}>{t('whoJoins')}</Text>
          {others.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {others.map((o) => (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  accessibilityLabel={t('removeName', { name: o })}
                  onPress={() => setOthers((list) => list.filter((x) => x !== o))}
                  style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 10, borderRadius: radius.chip, borderWidth: 1, borderColor: th.border, backgroundColor: th.card }}
                >
                  <Text style={{ fontSize: 15, color: th.text }}>{o}</Text>
                  <Ionicons name="close" size={16} color={th.sub} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              ref={draftRef}
              accessibilityLabel={t('addName')}
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                setError('');
              }}
              onSubmitEditing={addDraft}
              blurOnSubmit={false}
              placeholder={t('addName')}
              placeholderTextColor={th.sub}
              returnKeyType="done"
              style={[field, { flex: 1, height: 48, borderStyle: 'dashed', backgroundColor: 'transparent' }]}
              maxLength={40}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('add')}
              onPress={addDraft}
              style={{ width: 48, height: 48, borderRadius: radius.field, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add" size={22} color={th.accent} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: th.sub, marginTop: 8 }}>{t('othersLater')}</Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setPickCurrency(true)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, marginTop: 20, paddingHorizontal: 16, borderRadius: radius.field, backgroundColor: th.card }}
          >
            <Text style={{ fontSize: 16, color: th.sub }}>{t('currency')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>{currency}</Text>
              <Ionicons name="chevron-forward" size={16} color={th.sub} />
            </View>
          </Pressable>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={{ color: th.danger, fontSize: 14, marginTop: 12 }}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="lock-closed-outline" size={14} color={th.sub} />
            <Text style={{ fontSize: 13, color: th.sub }}>{t('noAccountNeeded')}</Text>
          </View>
          <Button label={t('createList')} onPress={create} />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={pickCurrency} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickCurrency(false)}>
        <View style={{ flex: 1, backgroundColor: th.bg, paddingTop: 16 }}>
          <TopBar title={t('currency')} right={<Button kind="ghost" label={t('done')} onPress={() => setPickCurrency(false)} />} />
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ backgroundColor: th.card, borderRadius: 18 }}>
              {CURRENCIES.map((c, i) => (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: c === currency }}
                  onPress={() => {
                    setCurrency(c);
                    setPickCurrency(false);
                  }}
                  style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: i < CURRENCIES.length - 1 ? 1 : 0, borderBottomColor: th.line }}
                >
                  <Text style={{ flex: 1, fontSize: 16, color: th.text }}>{c}</Text>
                  {c === currency ? <Ionicons name="checkmark" size={20} color={th.accent} /> : null}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { showToast } from '../../../components/Toast';
import { Avatar, Button, Card, Row, Screen, SectionLabel, TopBar } from '../../../components/ui';
import { computeBalances } from '../../../lib/balances';
import { money } from '../../../lib/domain';
import { t } from '../../../lib/i18n';
import { nowIso, uuid } from '../../../lib/ids';
import { inviteLink, shareCsv, shareInvite } from '../../../lib/share';
import { enqueue, removeLocal, setProfile, updateLocal, useList, useStore } from '../../../lib/store';
import { syncList } from '../../../lib/sync';
import { radius, useTheme } from '../../../lib/theme';

type Edit = null | { kind: 'listName' } | { kind: 'member'; id: string } | { kind: 'newMember' } | { kind: 'iban' };

export default function Manage() {
  const th = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { local, view } = useList(id);
  const profile = useStore((s) => s.profile);
  const [edit, setEdit] = useState<Edit>(null);
  const [text, setText] = useState('');
  const [pickMe, setPickMe] = useState(false);

  if (!local || !view) return null;
  const balances = computeBalances(view.entries, view.members);
  const members = view.members.filter((m) => !m.deleted);
  const meMember = view.members.find((m) => m.id === local.me);
  const cur = view.list.currency;

  const open = (e: Edit, initial: string) => {
    setText(initial);
    setEdit(e);
  };

  const submit = () => {
    const v = text.trim();
    if (!edit) return;
    const ts = nowIso();
    if (edit.kind === 'listName' && v) {
      enqueue(local.id, { op: 'list', data: { name: v.slice(0, 80), updatedAt: ts }, summary: t('actRenamedList', { name: v }) });
    } else if (edit.kind === 'member' && v) {
      const m = view.members.find((x) => x.id === edit.id)!;
      enqueue(local.id, { op: 'member', data: { ...m, name: v.slice(0, 40), updatedAt: ts }, summary: t('actRenamed', { old: m.name, name: v }) });
    } else if (edit.kind === 'newMember' && v) {
      if (members.some((m) => m.name.toLowerCase() === v.toLowerCase())) {
        Alert.alert(t('nameTaken'));
        return;
      }
      enqueue(local.id, { op: 'member', data: { id: uuid(), name: v.slice(0, 40), updatedAt: ts }, summary: t('actAddedMember', { name: v }) });
    } else if (edit.kind === 'iban' && meMember) {
      const iban = v.replace(/\s+/g, ' ').toUpperCase().slice(0, 40);
      enqueue(local.id, { op: 'member', data: { ...meMember, iban: iban || null, updatedAt: ts } });
      setProfile({ iban });
    }
    syncList(local.id);
    setEdit(null);
  };

  const removeMember = (mid: string) => {
    const m = view.members.find((x) => x.id === mid)!;
    if ((balances[mid] ?? 0) !== 0) {
      Alert.alert(t('cantRemoveTitle', { name: m.name }), t('cantRemoveBody', { amount: money(Math.abs(balances[mid]), cur) }));
      return;
    }
    if (mid === local.me) {
      Alert.alert(t('cantRemoveSelf'));
      return;
    }
    Alert.alert(t('removeMemberTitle', { name: m.name }), undefined, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: () => {
          enqueue(local.id, { op: 'member', data: { ...m, deleted: true, updatedAt: nowIso() }, summary: t('actRemovedMember', { name: m.name }) });
          syncList(local.id);
        },
      },
    ]);
  };

  const toggleArchive = () => {
    const archived = !view.list.archived;
    enqueue(local.id, { op: 'list', data: { archived, updatedAt: nowIso() }, summary: archived ? t('actArchived') : t('actUnarchived') });
    syncList(local.id);
    showToast(archived ? t('archivedToast') : t('unarchivedToast'));
  };

  const leave = () => {
    Alert.alert(t('leaveTitle'), t('leaveBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('leave'),
        style: 'destructive',
        onPress: () => {
          router.dismissAll();
          router.replace('/');
          removeLocal(local.id);
        },
      },
    ]);
  };

  const editTitle =
    edit?.kind === 'listName' ? t('listName') : edit?.kind === 'newMember' ? t('addPerson') : edit?.kind === 'iban' ? t('yourIban') : t('changeName');

  return (
    <Screen>
      <TopBar backLabel={t('back')} title={t('manageList')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}>
        <SectionLabel>{t('invite')}</SectionLabel>
        <Card style={{ padding: 18, alignItems: 'center', gap: 14 }}>
          <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }} accessible accessibilityLabel={t('qrA11y')}>
            <QRCode value={inviteLink(local.token)} size={168} color="#14171A" backgroundColor="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 14, color: th.sub, textAlign: 'center' }}>{t('qrHint')}</Text>
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            <Button label={t('shareInvite')} icon="share-outline" onPress={() => shareInvite(view.list.name, local.token)} />
            <Button
              label={t('copyCode')}
              kind="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(local.token);
                showToast(t('codeCopied'));
              }}
            />
          </View>
        </Card>

        <SectionLabel>{t('members')}</SectionLabel>
        <Card>
          {members.map((m, i) => (
            <View key={m.id} style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}>
              <Avatar name={m.name} index={i} />
              <Pressable
                accessibilityRole="button"
                accessibilityHint={t('renameHint')}
                onPress={() => open({ kind: 'member', id: m.id }, m.name)}
                style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: th.text }}>
                  {m.name}
                  {m.id === local.me ? <Text style={{ color: th.sub, fontWeight: '400' }}> ({t('you').toLowerCase()})</Text> : null}
                </Text>
                {m.iban ? <Text style={{ fontSize: 12, color: th.sub }}>{m.iban}</Text> : null}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('removeName', { name: m.name })} onPress={() => removeMember(m.id)} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="remove-circle-outline" size={22} color={th.sub} />
              </Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => open({ kind: 'newMember' }, '')} style={styles.row}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: th.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={20} color={th.accent} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: th.accent }}>{t('addPerson')}</Text>
          </Pressable>
        </Card>

        <SectionLabel>{t('you')}</SectionLabel>
        <Card>
          <Row label={t('iAm')} value={meMember?.name ?? '—'} onPress={() => setPickMe(true)} />
          <Row
            label={t('yourIban')}
            value={meMember?.iban ?? t('notSet')}
            onPress={() => open({ kind: 'iban' }, meMember?.iban ?? profile.iban)}
            last
          />
        </Card>
        <Text style={{ fontSize: 13, color: th.sub, marginTop: 6, paddingHorizontal: 2 }}>{t('ibanHint')}</Text>

        <SectionLabel>{t('list')}</SectionLabel>
        <Card>
          <Row icon="create-outline" label={t('listName')} value={view.list.name} onPress={() => open({ kind: 'listName' }, view.list.name)} />
          <Row icon="cash-outline" label={t('currency')} value={cur} />
          <Row icon="bar-chart-outline" label={t('stats')} onPress={() => router.push({ pathname: '/list/[id]/stats', params: { id: local.id } })} />
          <Row icon="time-outline" label={t('history')} onPress={() => router.push({ pathname: '/list/[id]/activity', params: { id: local.id } })} />
          <Row icon="document-text-outline" label={t('exportCsv')} onPress={() => shareCsv(view)} />
          <Row icon={view.list.archived ? 'arrow-undo-outline' : 'archive-outline'} label={view.list.archived ? t('unarchive') : t('archive')} onPress={toggleArchive} last />
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Row icon="exit-outline" label={t('leaveTitle')} onPress={leave} danger last />
        </Card>
      </ScrollView>

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: th.scrim, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: th.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, gap: 14 }}>
            <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: th.text }}>
              {editTitle}
            </Text>
            <TextInput
              accessibilityLabel={editTitle}
              value={text}
              onChangeText={setText}
              autoFocus
              autoCapitalize={edit?.kind === 'iban' ? 'characters' : 'sentences'}
              placeholder={edit?.kind === 'iban' ? 'NL00 BANK 0123 4567 89' : ''}
              placeholderTextColor={th.sub}
              onSubmitEditing={submit}
              maxLength={edit?.kind === 'listName' ? 80 : 40}
              style={{ height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 17, color: th.text }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={t('cancel')} kind="secondary" onPress={() => setEdit(null)} style={{ flex: 1 }} />
              <Button label={t('save')} onPress={submit} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={pickMe} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickMe(false)}>
        <View style={{ flex: 1, backgroundColor: th.bg, padding: 20 }}>
          <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '700', color: th.text, marginBottom: 14 }}>
            {t('whoAreYou')}
          </Text>
          <Card>
            {members.map((m, i) => (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: m.id === local.me }}
                onPress={() => {
                  updateLocal(local.id, { me: m.id });
                  setPickMe(false);
                }}
                style={[styles.row, i < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: th.line }]}
              >
                <Avatar name={m.name} index={i} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: th.text }}>{m.name}</Text>
                <Ionicons name={m.id === local.me ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={m.id === local.me ? th.accent : th.border} />
              </Pressable>
            ))}
          </Card>
          <View style={{ flex: 1 }} />
          <Button label={t('done')} kind="secondary" onPress={() => setPickMe(false)} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
});

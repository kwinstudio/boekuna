import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { Button, IconButton, Screen, TopBar } from '../../components/ui';
import { t } from '../../lib/i18n';
import { extractToken } from '../../lib/ids';
import { radius, useTheme } from '../../lib/theme';

export default function JoinWithCode() {
  const th = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const go = (text: string) => {
    const token = extractToken(text);
    if (!token) {
      setError(t('errCode'));
      return false;
    }
    router.replace(`/join/${token}`);
    return true;
  };

  const startScan = async () => {
    setError('');
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setError(t('errCamera'));
        return;
      }
    }
    handled.current = false;
    setScanning(true);
  };

  return (
    <Screen>
      <TopBar backLabel={t('back')} title={t('joinTitle')} />
      <KeyboardAvoidingView style={{ flex: 1, paddingHorizontal: 20 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scanning ? (
          <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', marginVertical: 12, backgroundColor: '#000' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current) return;
                if (extractToken(data)) {
                  handled.current = true;
                  setScanning(false);
                  go(data);
                }
              }}
            />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, overflow: 'hidden' }}>
                {t('pointAtQr')}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, paddingTop: 12 }}>
            <Text style={{ fontSize: 16, color: th.sub, lineHeight: 23, marginBottom: 20 }}>{t('joinBody')}</Text>
            <Button label={t('scanQr')} icon="qr-code-outline" kind="secondary" onPress={startScan} style={{ marginBottom: 24 }} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: th.text, marginBottom: 8 }}>{t('orEnterCode')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                accessibilityLabel={t('codeOrLink')}
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setError('');
                }}
                placeholder={t('codeOrLink')}
                placeholderTextColor={th.sub}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => go(code)}
                style={{ flex: 1, height: 52, borderRadius: radius.field, borderWidth: 1, borderColor: th.border, backgroundColor: th.field, paddingHorizontal: 16, fontSize: 16, color: th.text }}
              />
              <IconButton
                icon="clipboard-outline"
                label={t('paste')}
                size={52}
                onPress={async () => {
                  const s = await Clipboard.getStringAsync();
                  setCode(s);
                  if (s) go(s);
                }}
              />
            </View>
            {error ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12 }}>
                <Ionicons name="alert-circle-outline" size={16} color={th.danger} />
                <Text accessibilityLiveRegion="polite" style={{ color: th.danger, fontSize: 14, flex: 1 }}>
                  {error}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        {scanning ? (
          <Button label={t('cancel')} kind="secondary" onPress={() => setScanning(false)} />
        ) : (
          <Button label={t('next')} onPress={() => go(code)} disabled={!code.trim()} />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

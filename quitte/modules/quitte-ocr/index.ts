import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type TextBox = { text: string; x: number; y: number; w: number; h: number };

const Native = Platform.OS === 'ios' ? requireOptionalNativeModule<{ recognize(uri: string): Promise<TextBox[]> }>('QuitteOcr') : null;

/** Tekstherkenning op het toestel zelf (Apple Vision). Niets gaat naar een server. */
export const ocrAvailable = !!Native;

export async function recognizeText(uri: string): Promise<TextBox[]> {
  if (!Native) throw new Error('ocr_unavailable');
  return Native.recognize(uri);
}

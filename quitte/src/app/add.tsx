// Snelle invoer van buitenaf: quitte://add?bedrag=12,50&wat=Pizza&lijst=Texel
// Te gebruiken vanuit Siri / Opdrachten ("Open URL") en de snelle acties op het app-icoon.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';

export default function Add() {
  const p = useLocalSearchParams<{ bedrag?: string; amount?: string; wat?: string; title?: string; lijst?: string; list?: string; scan?: string }>();
  const lists = useStore((s) => Object.values(s.lists).filter((l) => !l.base.list.archived));
  const want = (p.lijst ?? p.list ?? '').toString().trim().toLowerCase();
  const byName = want ? lists.find((l) => l.base.list.name.toLowerCase().includes(want)) : undefined;
  const recent = [...lists].sort((a, b) => (b.lastSyncAt ?? b.joinedAt) - (a.lastSyncAt ?? a.joinedAt))[0];
  const target = byName ?? (lists.length === 1 ? lists[0] : want ? undefined : recent);
  if (!target) return <Redirect href="/" />;
  const amount = (p.bedrag ?? p.amount)?.toString();
  const title = (p.wat ?? p.title)?.toString();
  return (
    <Redirect
      href={{ pathname: '/list/[id]/entry', params: { id: target.id, ...(amount ? { amount } : {}), ...(title ? { title } : {}), ...(p.scan === '1' ? { scan: '1' } : {}) } }}
    />
  );
}

import { Redirect } from 'expo-router';
import { useStore } from '../lib/store';

export default function Index() {
  const signedIn = useStore((s) => !!s.userId);
  return <Redirect href={signedIn ? '/notes' : '/welcome'} />;
}

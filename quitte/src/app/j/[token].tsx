import { Redirect, useLocalSearchParams } from 'expo-router';

/** Universele link https://quitte-app.vercel.app/j/<code> komt hier binnen en gaat naar het meedoen-scherm. */
export default function InviteLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <Redirect href={{ pathname: '/join/[token]', params: { token: String(token) } }} />;
}

import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth/login" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/register" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/loading_auth" options={{ animation: 'fade' }} />
      <Stack.Screen name="auth/confirm-email" options={{ animation: 'fade' }} />
    </Stack>
  );
}
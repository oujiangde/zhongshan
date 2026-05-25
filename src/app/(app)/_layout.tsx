import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="lobby" />
      <Stack.Screen name="game" />
      <Stack.Screen name="settlement" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="leaderboard" />
      <Stack.Screen name="achievements" />
      <Stack.Screen name="history" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="friends" />
      <Stack.Screen name="mailbox" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="admin" />
    </Stack>
  );
}

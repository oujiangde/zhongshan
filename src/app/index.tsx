import { Redirect } from 'expo-router';

// 直接进大厅，游客身份由 ctx.tsx 后台静默创建，无需等待
export default function Index() {
  return <Redirect href="/(app)/lobby" />;
}

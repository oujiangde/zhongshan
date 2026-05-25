/**
 * OTA 版本检查工具
 * 从 Supabase app_versions 表读取最新版本，与本地版本比较
 */
import Constants from 'expo-constants';
import { supabase } from '@/client/supabase';

export interface AppVersionInfo {
  version: string;
  version_code: number;
  download_url: string;
  changelog: string;
  force_update: boolean;
}

/** 获取当前安装包的版本号（数字），如 "1.0.19" → 19 */
function getLocalVersionCode(): number {
  // app.json 里 android.versionCode / ios.buildNumber
  const raw =
    (Constants.expoConfig?.android?.versionCode as number | undefined) ??
    Number(Constants.expoConfig?.ios?.buildNumber ?? '0');
  return raw;
}

/** 获取当前安装包的版本字符串，如 "1.0.19" */
export function getLocalVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/**
 * 检查是否有新版本可用
 * @returns null = 无需更新；AppVersionInfo = 有新版本
 */
export async function checkForUpdate(): Promise<AppVersionInfo | null> {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('version, version_code, download_url, changelog, force_update')
      .eq('is_active', true)
      .order('version_code', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const localCode = getLocalVersionCode();
    if (data.version_code > localCode) {
      return data as AppVersionInfo;
    }
    return null;
  } catch {
    // 网络异常静默忽略，不影响正常使用
    return null;
  }
}

/**
 * 应用更新弹窗组件
 * 精品手游风格：深色金边，强制/非强制两种模式
 */
import { Modal, View, Text, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { AppVersionInfo } from '@/utils/checkUpdate';
import { getLocalVersion } from '@/utils/checkUpdate';

interface UpdateModalProps {
  visible: boolean;
  info: AppVersionInfo;
  onDismiss: () => void;
}

export function UpdateModal({ visible, info, onDismiss }: UpdateModalProps) {
  const handleUpdate = async () => {
    if (info.download_url) {
      await WebBrowser.openBrowserAsync(info.download_url);
    }
    if (!info.force_update) onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{
        flex: 1, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
      }}>
        <View style={{
          width: 320,
          backgroundColor: '#071a0e',
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: '#c8a800',
          overflow: 'hidden',
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 40, color: 'rgba(255,215,0,0.25)' }],
        }}>
          {/* 顶部金色标题栏 */}
          <View style={{
            backgroundColor: 'rgba(200,168,0,0.15)',
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(200,168,0,0.3)',
            alignItems: 'center',
            gap: 4,
          }}>
            <Text style={{ fontSize: 22 }}>🎉</Text>
            <Text style={{
              color: '#FFD700', fontSize: 18, fontWeight: '900', letterSpacing: 2,
              textShadowColor: 'rgba(255,215,0,0.4)', textShadowRadius: 8,
              textShadowOffset: { width: 0, height: 0 },
            }}>发现新版本</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                {getLocalVersion()}
              </Text>
              <Text style={{ color: 'rgba(255,215,0,0.6)', fontSize: 14 }}>→</Text>
              <Text style={{ color: '#FFD700', fontSize: 13, fontWeight: '700' }}>
                {info.version}
              </Text>
            </View>
          </View>

          {/* 更新内容 */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 8 }}>
            <Text style={{ color: 'rgba(255,215,0,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
              更新内容
            </Text>
            <Text style={{
              color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 20,
            }}>{info.changelog || '优化游戏体验，修复已知问题。'}</Text>
          </View>

          {/* 按钮区 */}
          <View style={{
            flexDirection: 'row', gap: 10,
            paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4,
          }}>
            {/* 暂不更新（非强制时才显示） */}
            {!info.force_update && (
              <Pressable
                onPress={onDismiss}
                style={{
                  flex: 1, height: 46, borderRadius: 23,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
                }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' }}>
                  暂不更新
                </Text>
              </Pressable>
            )}
            {/* 立即更新 */}
            <Pressable
              onPress={handleUpdate}
              style={{
                flex: 2, height: 46, borderRadius: 23,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#E8340A',
                borderWidth: 1.5, borderColor: '#FF6040',
                boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 16, color: 'rgba(232,52,10,0.6)' }],
              }}>
              <Text style={{
                color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2,
                textShadowColor: 'rgba(255,100,50,0.5)', textShadowRadius: 6,
                textShadowOffset: { width: 0, height: 0 },
              }}>立即更新</Text>
            </Pressable>
          </View>

          {/* 强制更新说明 */}
          {info.force_update && (
            <Text style={{
              color: 'rgba(255,107,107,0.7)', fontSize: 11,
              textAlign: 'center', paddingBottom: 14,
            }}>此版本为强制更新，需更新后才能继续游戏</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * 游戏音效管理工具
 * 基于 expo-audio，统一管理大厅音效的预加载与播放
 */
import { useEffect, useRef, useState } from 'react';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

import sfxClick from '../../assets/sounds/click.mp3';
import sfxEnter from '../../assets/sounds/enter.mp3';
import sfxMatch from '../../assets/sounds/match.mp3';
import bgmTrack  from '../../assets/sounds/bgm.mp3';

export { sfxClick as SFX_CLICK, sfxEnter as SFX_ENTER, sfxMatch as SFX_MATCH };

const BGM_VOLUME_KEY = 'lobby_bgm_volume'; // AsyncStorage 键
const BGM_MUTED_KEY  = 'lobby_bgm_muted';
const DEFAULT_VOLUME = 0.5;

/**
 * 初始化音频模式（大厅 mount 时调用一次）
 * 不独占音频焦点，静音模式下不播放（尊重用户习惯）
 */
export async function initAudio(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
    });
  } catch {
    /* 部分平台/版本不支持，忽略 */
  }
}

/**
 * 安全播放辅助：先跳回起始位再播放，支持重复快速触发
 */
async function safePlay(player: ReturnType<typeof useAudioPlayer>): Promise<void> {
  try {
    await player.seekTo(0);
    player.play();
  } catch {
    /* 静默失败，不影响业务逻辑 */
  }
}

/**
 * 大厅音效 Hook —— 在组件内调用，返回各类播放函数
 * 每类音效维护独立播放器，避免并发截断
 */
export function useLobbySound() {
  const clickPlayer = useAudioPlayer(sfxClick);
  const enterPlayer = useAudioPlayer(sfxEnter);
  const matchPlayer = useAudioPlayer(sfxMatch);

  /** 按钮点击音（轻快短促） */
  const playClick = () => { void safePlay(clickPlayer); };

  /** 入场音效（大厅初次进入时播放） */
  const playEnter = () => { void safePlay(enterPlayer); };

  /** 匹配/开始游戏音效 */
  const playMatch = () => { void safePlay(matchPlayer); };

  return { playClick, playEnter, playMatch };
}

/**
 * 大厅背景音乐 Hook
 *
 * - 循环播放 BGM
 * - 音量 0.0 ~ 1.0，持久化到 AsyncStorage
 * - 静音状态持久化
 * - 提供 play / pause / setVolume / toggleMute 方法
 * - 由调用方在 useFocusEffect 里控制播放/暂停生命周期
 */
export function useLobbyBGM() {
  const player = useAudioPlayer(bgmTrack);
  const [volume,  setVolumeState]  = useState(DEFAULT_VOLUME);
  const [muted,   setMutedState]   = useState(false);
  const [playing, setPlayingState] = useState(false);
  const initialized = useRef(false);

  // 启动时从持久化读取音量 & 静音
  useEffect(() => {
    (async () => {
      try {
        const [savedVol, savedMuted] = await Promise.all([
          AsyncStorage.getItem(BGM_VOLUME_KEY),
          AsyncStorage.getItem(BGM_MUTED_KEY),
        ]);
        const vol   = savedVol   != null ? parseFloat(savedVol)         : DEFAULT_VOLUME;
        const mute  = savedMuted != null ? savedMuted === 'true'        : false;
        setVolumeState(vol);
        setMutedState(mute);
        // 应用到播放器
        player.volume = mute ? 0 : vol;
        player.loop   = true;
      } catch { /* 忽略 */ }
      initialized.current = true;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 开始播放 BGM（idempotent） */
  const play = () => {
    try {
      player.loop   = true;
      player.volume = muted ? 0 : volume;
      player.play();
      setPlayingState(true);
    } catch { /* ignore */ }
  };

  /** 暂停 BGM */
  const pause = () => {
    try {
      player.pause();
      setPlayingState(false);
    } catch { /* ignore */ }
  };

  /** 调节音量（0.0 ~ 1.0），自动解除静音 */
  const setVolume = async (val: number) => {
    const v = Math.max(0, Math.min(1, val));
    setVolumeState(v);
    setMutedState(false);
    player.volume = v;
    await AsyncStorage.setItem(BGM_VOLUME_KEY, String(v));
    await AsyncStorage.setItem(BGM_MUTED_KEY,  'false');
  };

  /** 切换静音 */
  const toggleMute = async () => {
    const next = !muted;
    setMutedState(next);
    player.volume = next ? 0 : volume;
    await AsyncStorage.setItem(BGM_MUTED_KEY, String(next));
  };

  return { playing, volume, muted, play, pause, setVolume, toggleMute };
}


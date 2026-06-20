// tauri-file.ts
import { useEffect, useState } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { logger } from './logger';

// module-level cache：path -> objectUrl
const objectUrlCache = new Map<string, string>();
// reference count optional: path -> count, 用于在没人用时 revoke（可选）
const refCount = new Map<string, number>();

function guessImageMime(path?: string): string {
  if (!path) return 'application/octet-stream';
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return 'application/octet-stream';
  if (['jpg','jpeg'].includes(ext)) return 'image/jpeg';
  if (['png'].includes(ext)) return 'image/png';
  if (['gif'].includes(ext)) return 'image/gif';
  if (['webp'].includes(ext)) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * Hook: 返回 src (string) —— 若 path 相同会复用已存在的 object URL，避免闪烁。
 */
export function useLocalImageUrl(path?: string): { src: string; loading: boolean; error?: Error | null } {
  const [src, setSrc] = useState<string>(() => (path ? (objectUrlCache.get(path) ?? '') : ''));
  const [loading, setLoading] = useState<boolean>(() => (path ? !objectUrlCache.has(path) : false));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!path) {
      setSrc('');
      setLoading(false);
      setError(null);
      return;
    }

    // 如果缓存命中，直接使用且不触发读取
    const cached = objectUrlCache.get(path);
    if (cached) {
      setSrc(cached);
      setLoading(false);
      setError(null);
      // bump refcount
      refCount.set(path, (refCount.get(path) || 0) + 1);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        // readFile 返回 Uint8Array-like
        const data = await readFile(path);
        const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data as any);
        const mime = guessImageMime(path);
        const blob = new Blob([uint8], { type: mime });
        const url = URL.createObjectURL(blob);
        // cache & refcount
        objectUrlCache.set(path, url);
        refCount.set(path, (refCount.get(path) || 0) + 1);

        if (mounted) {
          setSrc(url);
          setLoading(false);
          setError(null);
        }
      } catch (e) {
        logger.error('tauri-file', 'useLocalImageUrl read failed', e);
        if (mounted) {
          setError(e as Error);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      // release one refCount
      const count = refCount.get(path) || 0;
      if (count <= 1) {
        refCount.delete(path);
        const url = objectUrlCache.get(path);
        if (url) { URL.revokeObjectURL(url); objectUrlCache.delete(path); }
      } else {
        refCount.set(path, count - 1);
      }
    };
  }, [path]);

  return { src, loading, error };
}

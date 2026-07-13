import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteStoredBackground,
  loadStoredBackgrounds,
  saveStoredBackground,
  validateBackgroundFiles,
  type CustomBackground,
  type StoredBackground
} from "../utils/backgroundStorage";

const createId = () => globalThis.crypto?.randomUUID?.() ?? `bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useCustomBackgrounds() {
  const [backgrounds, setBackgrounds] = useState<CustomBackground[]>([]);
  const [message, setMessage] = useState("");
  const backgroundsRef = useRef<CustomBackground[]>([]);
  backgroundsRef.current = backgrounds;

  useEffect(() => {
    let cancelled = false;
    void loadStoredBackgrounds()
      .then((stored) => {
        if (cancelled) return;
        const loaded = stored
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((background) => ({ ...background, url: URL.createObjectURL(background.blob) }));
        setBackgrounds(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      for (const background of backgroundsRef.current) URL.revokeObjectURL(background.url);
    };
  }, []);

  const addBackgrounds = useCallback(async (files: File[]) => {
    try {
      validateBackgroundFiles(files, backgroundsRef.current.length);
      const created: CustomBackground[] = [];
      for (const file of files) {
        const stored: StoredBackground = {
          id: createId(),
          name: file.name,
          type: file.type,
          blob: file,
          createdAt: Date.now() + created.length
        };
        await saveStoredBackground(stored);
        created.push({ ...stored, url: URL.createObjectURL(file) });
      }
      setBackgrounds((current) => [...current, ...created]);
      setMessage(`${created.length}枚の背景画像を追加しました。`);
      return created;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "背景画像を追加できませんでした。");
      return [];
    }
  }, []);

  const removeBackground = useCallback(async (id: string) => {
    try {
      await deleteStoredBackground(id);
      setBackgrounds((current) => {
        const target = current.find((background) => background.id === id);
        if (target) URL.revokeObjectURL(target.url);
        return current.filter((background) => background.id !== id);
      });
      setMessage("背景画像を削除しました。");
      return true;
    } catch {
      setMessage("背景画像を削除できませんでした。");
      return false;
    }
  }, []);

  return { backgrounds, addBackgrounds, removeBackground, backgroundMessage: message, setBackgroundMessage: setMessage };
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { accentFromPrimary, AppTheme, buildTheme, DEFAULT_THEME, interpolateTheme, isAppTheme } from "./palette";
import { UNIVERSITIES } from "./universities";

const STORAGE_KEY = "watch.app-theme.v1";

type ThemeContextValue = {
  theme: AppTheme;
  displayed: AppTheme;
  ready: boolean;
  applyUniversity: (universityId: string | null) => void;
  applyLogo: (colors: string[], logoUri: string, name?: string) => void;
  resetTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(DEFAULT_THEME);
  const [displayed, setDisplayed] = useState<AppTheme>(DEFAULT_THEME);
  const [ready, setReady] = useState(false);
  const displayedRef = useRef(DEFAULT_THEME);
  const progress = useRef(new Animated.Value(0)).current;
  const listenerRef = useRef<string | null>(null);

  const transitionTo = useCallback(
    (next: AppTheme) => {
      const from = displayedRef.current;
      if (listenerRef.current) progress.removeListener(listenerRef.current);
      progress.stopAnimation();
      progress.setValue(0);
      listenerRef.current = progress.addListener(({ value }) => {
        const mixed = interpolateTheme(from, next, value);
        displayedRef.current = mixed;
        setDisplayed(mixed);
      });
      Animated.timing(progress, {
        toValue: 1,
        duration: 520,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) return;
        if (listenerRef.current) progress.removeListener(listenerRef.current);
        listenerRef.current = null;
        displayedRef.current = next;
        setDisplayed(next);
      });
      setTheme(next);
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [progress],
  );

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as unknown;
        if (isAppTheme(saved)) transitionTo(saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [transitionTo]);

  const applyUniversity = useCallback(
    (universityId: string | null) => {
      if (!universityId) {
        transitionTo(DEFAULT_THEME);
        return;
      }
      const university = UNIVERSITIES.find((item) => item.id === universityId);
      if (!university) {
        transitionTo(DEFAULT_THEME);
        return;
      }
      transitionTo(
        buildTheme({
          id: university.id,
          name: university.shortName,
          source: "university",
          universityId: university.id,
          primary: university.primary,
          accent: university.accent,
        }),
      );
    },
    [transitionTo],
  );

  const applyLogo = useCallback(
    (colors: string[], logoUri: string, name = "Custom institution") => {
      const primary = colors[0];
      const accent = colors[1] ?? accentFromPrimary(primary);
      transitionTo(
        buildTheme({
          id: "logo",
          name,
          source: "logo",
          logoUri,
          primary,
          accent,
        }),
      );
    },
    [transitionTo],
  );

  const resetTheme = useCallback(() => transitionTo(DEFAULT_THEME), [transitionTo]);

  const value = useMemo(
    () => ({ theme, displayed, ready, applyUniversity, applyLogo, resetTheme }),
    [theme, displayed, ready, applyUniversity, applyLogo, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider.");
  }
  return context;
}
import { defaultTheme, toNativeTheme, type NativeTheme } from '@yusr/theme';
import { createContext, useContext, type ReactNode } from 'react';

/** The app is dark only, like the website (2026-11-17): one look for everyone, whatever the device prefers. */
const DARK = toNativeTheme(defaultTheme, 'dark');
const Context = createContext<NativeTheme>(DARK);

/** The same tokens as the website (colors, radii, type scale), in the dark scheme. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={DARK}>{children}</Context.Provider>;
}

export function useTheme(): NativeTheme {
  return useContext(Context);
}

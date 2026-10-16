import { defaultTheme, toNativeTheme, type NativeTheme } from '@yusr/theme';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const Context = createContext<NativeTheme>(toNativeTheme(defaultTheme, 'light'));

/** The same tokens as the website (colors, radii, type scale), resolved for the device's scheme. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => toNativeTheme(defaultTheme, scheme), [scheme]);
  return <Context.Provider value={theme}>{children}</Context.Provider>;
}

export function useTheme(): NativeTheme {
  return useContext(Context);
}

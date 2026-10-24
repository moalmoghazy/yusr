// Polyfills first: @yusr/i18n formats numbers, plurals and dates with Intl.
import '@/lib/intl';
import { Amiri_700Bold } from '@expo-google-fonts/amiri';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi';
import { ThemeProvider as NavigationTheme, type Theme as NavigationThemeValue } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Registered under the names @yusr/theme's nativeFonts uses. Headings are IBM Plex Sans Arabic bold
  // (the text family); Reem Kufi is the logo face, for the English name beside the mark; Amiri is the
  // face nearest the logo's lettering, for the opening line.
  const [fontsLoaded, fontError] = useFonts({
    ReemKufi_700Bold,
    Amiri_700Bold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    IBMPlexMono_400Regular,
  });
  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <Navigator />
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const theme = useTheme();
  const { t } = useI18n();
  // The language (and so the layout direction) is known by now: reveal the first frame.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const navigationTheme = useMemo<NavigationThemeValue>(
    () => ({
      dark: theme.scheme === 'dark',
      colors: {
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.card,
        text: theme.colors.foreground,
        border: theme.colors.border,
        notification: theme.colors.highlight,
      },
      fonts: {
        regular: { fontFamily: theme.fonts.regular, fontWeight: '400' },
        medium: { fontFamily: theme.fonts.medium, fontWeight: '500' },
        bold: { fontFamily: theme.fonts.bold, fontWeight: '700' },
        heavy: { fontFamily: theme.fonts.bold, fontWeight: '800' },
      },
    }),
    [theme],
  );
  return (
    <NavigationTheme value={navigationTheme}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: theme.colors.primary,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTitleStyle: { fontFamily: theme.fonts.bold, color: theme.colors.foreground },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="case/[slug]" options={{ title: '' }} />
        <Stack.Screen name="receipt" options={{ title: t('receipt.title'), presentation: 'modal' }} />
      </Stack>
    </NavigationTheme>
  );
}

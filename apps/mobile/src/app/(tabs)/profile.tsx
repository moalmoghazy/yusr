import type { Locale } from '@yusr/core';
import { brand } from '@yusr/theme';
import type { IconName } from '@yusr/ui/icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Lockup } from '@/components/LogoMark';
import { SupervisionBadge } from '@/components/SupervisionBadge';
import { Text } from '@/components/Text';
import { WEB_URL } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const LANGUAGES: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: 'ar', label: 'العربية' },
  { locale: 'en', label: 'English' },
];

/** Settings and about: language (with the one-time restart RTL needs), submitting a case, support. */
export default function Profile() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t, setLocale } = useI18n();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const open = (path: string) => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}${path}`);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 32, gap: 22 }}
    >
      <Text variant="heading" accessibilityRole="header">
        {t('mobile.settings')}
      </Text>

      <Group title={t('mobile.language')} note={t('mobile.languageRestart')}>
        <View role="radiogroup" accessibilityLabel={t('mobile.language')}>
          {LANGUAGES.map((option, index) => {
            const selected = option.locale === locale;
            return (
              <Pressable
                key={option.locale}
                role="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void setLocale(option.locale)}
                style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }]}
              >
                <Icon name="languages" size={20} color={theme.colors.primary} />
                <Text weight="medium" style={{ flex: 1, writingDirection: option.locale === 'ar' ? 'rtl' : 'ltr' }}>
                  {option.label}
                </Text>
                {selected && <Icon name="check" size={20} color={theme.colors.primary} strokeWidth={2.2} />}
              </Pressable>
            );
          })}
        </View>
      </Group>

      <View style={[styles.cta, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.card }]}>
        <Text variant="title" color={theme.colors.primarySoftForeground}>
          {t('landing.ctaTitle')}
        </Text>
        <Text variant="label" weight="regular" color={theme.colors.primarySoftForeground}>
          {t('mobile.submitHint')}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => open('/submit')}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Icon name="plus" size={18} color={theme.colors.primaryForeground} />
          <Text variant="label" weight="bold" color={theme.colors.primaryForeground}>
            {t('landing.ctaButton')}
          </Text>
        </Pressable>
      </View>

      <Group title={t('footer.help')}>
        <LinkRow icon="message" label={t('mobile.support')} onPress={() => void Linking.openURL(`mailto:${brand.contact.email}`)} />
        <LinkRow icon="compass" label={t('mobile.website')} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/${locale}`)} divider />
        <LinkRow icon="shield-check" label={t('nav.transparency')} onPress={() => open('#transparency')} divider />
      </Group>

      <Group title={t('mobile.about')}>
        <View style={{ gap: 14, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }} accessible accessibilityLabel={t('a11y.logo')}>
            <Lockup size={30} />
          </View>
          <Text variant="label" weight="regular" muted>
            {t('footer.aboutBody')}
          </Text>
          <SupervisionBadge />
        </View>
      </Group>

      <Text variant="caption" muted align="center">
        {t('mobile.version', { version })}
      </Text>
    </ScrollView>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" weight="bold" muted>
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radius.card,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {note && (
        <Text variant="caption" muted>
          {note}
        </Text>
      )}
    </View>
  );
}

function LinkRow({ icon, label, onPress, divider }: { icon: IconName; label: string; onPress: () => void; divider?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.muted },
      ]}
    >
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <Text weight="medium" style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="arrow-out" size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  cta: { gap: 8, padding: 18 },
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, marginTop: 6 },
});

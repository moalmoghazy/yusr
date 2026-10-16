import type { IconName } from '@yusr/ui/icons';
import { Tabs } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const TABS: ReadonlyArray<{ name: 'index' | 'explore' | 'donations' | 'profile'; icon: IconName }> = [
  { name: 'index', icon: 'home' },
  { name: 'explore', icon: 'compass' },
  { name: 'donations', icon: 'receipt' },
  { name: 'profile', icon: 'user' },
];

/** Four tabs; in Arabic the bar runs right to left with the layout. */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        tabBarLabelStyle: { fontFamily: theme.fonts.semibold, fontSize: 11 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(`mobile.tabs.${tab.name === 'index' ? 'home' : tab.name}`),
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size - 2} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}

import { CATEGORY_META, regionByCode, type CaseDetail, type DisbursementStatus } from '@yusr/core';
import type { IconName } from '@yusr/ui/icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { CaseCover } from '@/components/CaseCover';
import { Countdown } from '@/components/Countdown';
import { DonateSheet, type DonateTarget } from '@/components/DonateSheet';
import { Icon } from '@/components/Icon';
import { DonationProgress } from '@/components/Progress';
import { EmptyState, ErrorState, Loading } from '@/components/States';
import { Text } from '@/components/Text';
import { api, WEB_URL } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useQuery } from '@/lib/use-query';

/**
 * A case, as on the website: verified story, redacted documents, the verification trail and —
 * under «أين تذهب التبرعات» — each planned payment to a hospital, creditor or school and its status.
 * Opened with `section=transparency` (from a funded card), it scrolls straight there.
 */
export default function CaseScreen() {
  const params = useLocalSearchParams<{ slug: string; section?: string }>();
  const slug = String(params.slug);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale, t, f, l } = useI18n();
  const query = useQuery<CaseDetail | null>(`case:${locale}:${slug}`, () => api(locale).getCase(slug));
  const [donating, setDonating] = useState<DonateTarget | null>(null);
  const scroll = useRef<ScrollView>(null);
  const [transparencyY, setTransparencyY] = useState<number | null>(null);

  useEffect(() => {
    if (params.section === 'transparency' && transparencyY !== null) scroll.current?.scrollTo({ y: Math.max(0, transparencyY - 12), animated: true });
  }, [params.section, transparencyY]);

  if (query.loading && !query.data) return <Loading />;
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={query.refresh} />;
  const item = query.data;
  if (!item) return <EmptyState icon="search" title={t('case.notFound')} />;
  const open = item.status === 'published';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen
        options={{
          title: l(item.title),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.share')}
              hitSlop={10}
              onPress={() => void Share.share({ message: `${t('case.shareText')}\n${WEB_URL}/${locale}/cases/${item.slug}` })}
            >
              <Icon name="share" size={20} color={theme.colors.primary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: open ? 110 + insets.bottom : 32 }}
        refreshControl={<RefreshControl refreshing={query.refreshing} onRefresh={query.refresh} tintColor={theme.colors.primary} />}
      >
        <CaseCover category={item.category} seed={item.coverSeed} height={210} />
        <View style={{ padding: 20, gap: 18 }}>
          <Header item={item} />
          <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} large />
          {item.status === 'funded' && <Notice icon="check" text={t('case.fundedNotice')} tone="gold" />}
          {item.status === 'paused' && <Notice icon="pause" text={t('case.pausedNotice')} tone="warning" />}

          <Section title={t('case.story')}>
            <Text>{l(item.story)}</Text>
            <Text variant="caption" muted>
              {t('case.beneficiary')}: {l(item.beneficiary)}
            </Text>
            <Notice icon="landmark" text={t('case.paidDirectly')} tone="primary" />
          </Section>

          <Documents item={item} />
          <Verification item={item} />

          <View onLayout={(event) => setTransparencyY(event.nativeEvent.layout.y)}>
            <Transparency item={item} />
          </View>

          {item.updates.length > 0 && (
            <Section title={t('case.updates')}>
              {item.updates.map((update) => (
                <Card key={update.id}>
                  <Text variant="caption" muted>
                    {f.date(update.at, 'medium')}
                  </Text>
                  <Text>{l(update.body)}</Text>
                </Card>
              ))}
            </Section>
          )}

          <RecentDonors item={item} />
        </View>
      </ScrollView>

      {open && (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: theme.colors.card, borderTopColor: theme.colors.border }]}>
          <Button title={t('case.donateCta')} icon="heart" onPress={() => setDonating({ item })} />
        </View>
      )}
      <DonateSheet target={donating} onClose={() => setDonating(null)} />
    </View>
  );
}

function Header({ item }: { item: CaseDetail }) {
  const theme = useTheme();
  const { t, l } = useI18n();
  const category = CATEGORY_META[item.category];
  const tone = theme.tones[category.tone];
  const region = regionByCode(item.region);
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.badges}>
        <Pill icon={category.icon} text={t(`categories.${item.category}`)} bg={tone.soft} fg={tone.softForeground} />
        {item.verifiedAt && <Pill icon="shield-check" text={t('case.verified')} bg={theme.colors.primarySoft} fg={theme.colors.primarySoftForeground} />}
        {item.zakatEligible && <Pill icon="coins" text={t('case.zakatEligible')} bg={theme.colors.highlightSoft} fg={theme.colors.highlightSoftForeground} />}
      </View>
      <Text variant="heading" accessibilityRole="header">
        {l(item.title)}
      </Text>
      <View style={styles.meta}>
        <View style={styles.inline}>
          <Icon name="map-pin" size={15} color={theme.colors.mutedForeground} />
          <Text variant="label" weight="regular" muted>
            {region ? l(region.name) : item.region === 'INT' ? t('common.international') : item.region}
          </Text>
        </View>
        <Text variant="mono" muted style={{ writingDirection: 'ltr' }}>
          {item.reference}
        </Text>
      </View>
      {item.isUrgent && item.status === 'published' && (
        <View style={{ alignItems: 'flex-start' }}>
          <Countdown deadline={item.deadline} />
        </View>
      )}
    </View>
  );
}

function Documents({ item }: { item: CaseDetail }) {
  const theme = useTheme();
  const { t, f, l } = useI18n();
  if (item.documents.length === 0) return null;
  return (
    <Section title={t('case.documents')} note={t('case.redactedNotice')}>
      {item.documents.map((document) => (
        <Card key={document.id} row>
          <View style={[styles.docIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <Icon name="file-text" size={20} color={theme.colors.primarySoftForeground} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text weight="semibold">{l(document.title)}</Text>
            <Text variant="caption" muted>
              {t(`case.documentKinds.${document.kind}`)} · {t('units.pages', { count: document.pages })} · {f.date(document.issuedAt, 'medium')}
            </Text>
            <Text variant="caption" muted>
              {t('case.verifiedBy')}: {l(document.verifiedBy)}
            </Text>
          </View>
          {document.redacted && <Pill icon="eye-off" text={t('case.redacted')} bg={theme.colors.muted} fg={theme.colors.mutedForeground} />}
        </Card>
      ))}
    </Section>
  );
}

function Verification({ item }: { item: CaseDetail }) {
  const theme = useTheme();
  const { t, f, l } = useI18n();
  if (item.timeline.length === 0) return null;
  return (
    <Section title={t('case.verification')}>
      <View style={{ gap: 0 }}>
        {item.timeline.map((event, index) => {
          const last = index === item.timeline.length - 1;
          return (
            <View key={`${event.kind}-${event.at}`} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 22 }}>
                <View style={[styles.dot, { backgroundColor: theme.colors.primary }]}>
                  <Icon name="check" size={12} color={theme.colors.primaryForeground} strokeWidth={2.6} />
                </View>
                {!last && <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border }} />}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : 16 }}>
                <Text weight="semibold">{t(`case.timeline.${event.kind}`)}</Text>
                <Text variant="caption" muted>
                  {f.date(event.at, 'medium')} · {l(event.actor)}
                </Text>
                {event.note && (
                  <Text variant="label" weight="regular">
                    {l(event.note)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

const DISBURSEMENT: Record<DisbursementStatus, 'muted' | 'info' | 'success'> = { planned: 'muted', approved: 'info', paid: 'success' };

function Transparency({ item }: { item: CaseDetail }) {
  const theme = useTheme();
  const { t, f, l } = useI18n();
  const colors = {
    muted: { bg: theme.colors.muted, fg: theme.colors.mutedForeground },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.infoSoftForeground },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftForeground },
  };
  return (
    <Section title={t('case.transparency')} note={t('case.paidDirectly')}>
      {item.disbursements.map((line) => {
        const tone = colors[DISBURSEMENT[line.status]];
        return (
          <Card key={line.id}>
            <View style={styles.meta}>
              <Text weight="semibold" style={{ flex: 1 }}>
                {l(line.payee)}
              </Text>
              <Text weight="bold" style={{ fontVariant: ['tabular-nums'] }}>
                {f.money(line.amountMinor, item.currency, { fractionDigits: 0 })}
              </Text>
            </View>
            <Text variant="label" weight="regular" muted>
              {t(`case.payees.${line.payeeType}`)} · {l(line.purpose)}
            </Text>
            <View style={styles.inline}>
              <Pill text={t(`case.disbursement.${line.status}`)} bg={tone.bg} fg={tone.fg} />
              {line.paidAt && (
                <Text variant="caption" muted>
                  {f.date(line.paidAt, 'medium')}
                </Text>
              )}
            </View>
          </Card>
        );
      })}
    </Section>
  );
}

function RecentDonors({ item }: { item: CaseDetail }) {
  const { t, f } = useI18n();
  return (
    <Section title={t('case.recentDonors')}>
      {item.recentDonations.length === 0 ? (
        <Text muted>{t('case.noDonationsYet')}</Text>
      ) : (
        item.recentDonations.map((donation) => (
          <View key={donation.id} style={styles.meta}>
            <Text weight="medium">{donation.displayName ?? t('case.anonymous')}</Text>
            <Text variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>
              {f.money(donation.amountMinor, item.currency, { fractionDigits: 0 })} · {f.relative(donation.createdAt)}
            </Text>
          </View>
        ))
      )}
    </Section>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {note && (
        <Text variant="caption" muted>
          {note}
        </Text>
      )}
      {children}
    </View>
  );
}

function Card({ row, children }: { row?: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          gap: 6,
          padding: 14,
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: theme.radius.control,
        },
        row && { flexDirection: 'row', alignItems: 'center', gap: 12 },
      ]}
    >
      {children}
    </View>
  );
}

function Pill({ icon, text, bg, fg }: { icon?: IconName; text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon && <Icon name={icon} size={13} color={fg} strokeWidth={2} />}
      <Text variant="caption" weight="semibold" color={fg}>
        {text}
      </Text>
    </View>
  );
}

function Notice({ icon, text, tone }: { icon: IconName; text: string; tone: 'gold' | 'warning' | 'primary' }) {
  const theme = useTheme();
  const colors = {
    gold: { bg: theme.colors.highlightSoft, fg: theme.colors.highlightSoftForeground },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftForeground },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftForeground },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg, borderRadius: theme.radius.control }]}>
      <Icon name={icon} size={18} color={colors.fg} />
      <Text variant="label" weight="medium" color={colors.fg} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  docIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  bar: { position: 'absolute', start: 0, end: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});

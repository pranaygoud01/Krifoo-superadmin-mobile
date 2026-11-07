/**
 * Store sales — every store's sales for the selected period, in one list.
 * Search, filter (selling / no sales / needs help), sort, and a share-of-sales bar per store.
 * Phones get compact rows; tablets get a table with one column per measure.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { Search, X, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { StoreRow, formatMoneyCompact, formatPercent, formatCount } from '../../services/admin-metrics';
import { Delta, Flag } from './Delta';

type Filter = 'all' | 'selling' | 'none' | 'help';
type Sort = 'sales' | 'growth' | 'drop' | 'orders' | 'name';

const PAGE = 15;
/** Single-series magnitude → one hue (brand). */
const BAR = Colors.primary;

export function StoreSalesSection({
  rows,
  periodLabel,
  onOpenStore,
}: {
  rows: StoreRow[];
  periodLabel: string;
  onOpenStore: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const isTable = width >= 900;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('sales');
  const [showAll, setShowAll] = useState(false);

  const totals = useMemo(() => {
    const sales = rows.reduce((s, r) => s + r.sales, 0);
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const earnings = rows.reduce((s, r) => s + r.earnings, 0);
    const selling = rows.filter((r) => r.sales > 0).length;
    const top3 = rows
      .map((r) => r.sales)
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((s, v) => s + v, 0);
    return { sales, orders, earnings, selling, top3Share: sales ? top3 / sales : 0 };
  }, [rows]);

  const needsHelp = (r: StoreRow) => r.flags.some((f) => f !== 'growing');
  const counts = useMemo(
    () => ({
      all: rows.length,
      selling: rows.filter((r) => r.sales > 0).length,
      none: rows.filter((r) => r.sales === 0).length,
      help: rows.filter(needsHelp).length,
    }),
    [rows]
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter === 'selling' && r.sales <= 0) return false;
      if (filter === 'none' && r.sales > 0) return false;
      if (filter === 'help' && !needsHelp(r)) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
    const byName = (a: StoreRow, b: StoreRow) => a.name.localeCompare(b.name);
    const sorters: Record<Sort, (a: StoreRow, b: StoreRow) => number> = {
      sales: (a, b) => b.sales - a.sales || b.orders - a.orders || byName(a, b),
      growth: (a, b) => b.sales - b.prevSales - (a.sales - a.prevSales) || byName(a, b),
      drop: (a, b) => a.sales - a.prevSales - (b.sales - b.prevSales) || byName(a, b),
      orders: (a, b) => b.orders - a.orders || b.sales - a.sales || byName(a, b),
      name: byName,
    };
    return filtered.sort(sorters[sort]);
  }, [rows, query, filter, sort]);

  const maxSales = Math.max(...rows.map((r) => r.sales), 0);
  const shown = showAll || query ? list : list.slice(0, PAGE);
  // Rank is always by sales, so it means the same thing whatever the sort
  const salesRank = useMemo(() => {
    const m = new Map<string, number>();
    rows
      .filter((r) => r.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [rows]);

  return (
    <View style={styles.section}>
      {/* Header + summary */}
      <View style={styles.head}>
        <Text style={styles.title}>Store sales</Text>
        <Text style={styles.meta}>{periodLabel}</Text>
      </View>
      <Text style={styles.summary}>
        <Text style={styles.summaryStrong}>{totals.selling}</Text> of {rows.length} stores made sales · total{' '}
        <Text style={styles.summaryStrong}>{formatMoneyCompact(totals.sales)}</Text> from {formatCount(totals.orders)} orders
        {totals.selling > 3 ? ` · top 3 stores = ${formatPercent(totals.top3Share, 0)} of sales` : ''}
      </Text>

      {/* Search */}
      <View style={styles.search}>
        <Search size={16} color={Colors.textSubtle} />
        <TextInput
          style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search stores"
          placeholderTextColor={Colors.textSubtle}
          autoCorrect={false}
          accessibilityLabel="Search stores"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
            <X size={15} color={Colors.textSubtle} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(
          [
            { value: 'all', label: 'All stores' },
            { value: 'selling', label: 'Selling' },
            { value: 'none', label: 'No sales' },
            { value: 'help', label: 'Needs help' },
          ] as { value: Filter; label: string }[]
        ).map((f) => {
          const active = filter === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              <Text style={[styles.chipCount, active && styles.chipTextActive]}>{counts[f.value]}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sort */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortOptions}>
          {(
            [
              { value: 'sales', label: 'Highest sales' },
              { value: 'growth', label: 'Biggest growth' },
              { value: 'drop', label: 'Biggest drop' },
              { value: 'orders', label: 'Most orders' },
              { value: 'name', label: 'A–Z' },
            ] as { value: Sort; label: string }[]
          ).map((s) => {
            const active = sort === s.value;
            return (
              <TouchableOpacity key={s.value} onPress={() => setSort(s.value)} style={[styles.sortOpt, active && styles.sortOptActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Text style={[styles.sortText, active && styles.sortTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Table header (tablet) */}
      {isTable && list.length > 0 ? (
        <View style={[styles.tRow, styles.tHead]}>
          <Text style={[styles.th, styles.cRank]}>#</Text>
          <Text style={[styles.th, styles.cStore]}>Store</Text>
          <Text style={[styles.th, styles.cShare]}>Share of sales</Text>
          <Text style={[styles.th, styles.cNum]}>Sales</Text>
          <Text style={[styles.th, styles.cNum]}>Orders</Text>
          <Text style={[styles.th, styles.cNum]}>Avg order</Text>
          <Text style={[styles.th, styles.cNum]}>Cancelled</Text>
          <Text style={[styles.th, styles.cNum]}>Krifoo earned</Text>
          <Text style={[styles.th, styles.cChange]}>Change</Text>
        </View>
      ) : null}

      {/* Rows */}
      {list.length === 0 ? (
        <Text style={styles.empty}>
          {query ? `No stores match “${query}”.` : filter === 'help' ? 'No stores need help right now.' : filter === 'none' ? 'Every store made sales in this period.' : 'No stores yet.'}
        </Text>
      ) : (
        shown.map((r, i) => {
          const share = totals.sales ? r.sales / totals.sales : 0;
          const barWidth = maxSales ? `${Math.max(r.sales > 0 ? 2 : 0, (r.sales / maxSales) * 100)}%` : '0%';
          const avg = r.orders ? r.sales / r.orders : 0;
          const rank = salesRank.get(r.id);
          const last = i === shown.length - 1;
          const badges = (
            <>
              {!r.isLive && <Text style={styles.offline}>Offline</Text>}
              {r.flags.includes('declining') && <Flag label="Sales falling" />}
              {r.flags.includes('high_cancel') && <Flag label="High cancellations" />}
              {r.flags.includes('dormant') && <Flag label="No orders in 7 days" />}
            </>
          );

          if (isTable) {
            return (
              <TouchableOpacity key={r.id} style={[styles.tRow, !last && styles.divider]} onPress={() => onOpenStore(r.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${r.name}, ${formatMoneyCompact(r.sales)} sales`}>
                <Text style={[styles.rank, styles.cRank]}>{rank ?? '–'}</Text>
                <View style={styles.cStore}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={styles.badges}>{badges}</View>
                </View>
                <View style={[styles.cShare, styles.shareCell]}>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: barWidth as any }]} />
                  </View>
                  <Text style={styles.sharePct}>{formatPercent(share, 0)}</Text>
                </View>
                <Text style={[styles.td, styles.cNum, styles.tdStrong]}>{formatMoneyCompact(r.sales)}</Text>
                <Text style={[styles.td, styles.cNum]}>{r.orders}</Text>
                <Text style={[styles.td, styles.cNum]}>{r.orders ? formatMoneyCompact(avg) : '–'}</Text>
                <Text style={[styles.td, styles.cNum, r.flags.includes('high_cancel') && { color: Colors.statusRejected.text }]}>{r.placed ? formatPercent(r.cancelRate, 0) : '–'}</Text>
                <Text style={[styles.td, styles.cNum]}>{formatMoneyCompact(r.earnings)}</Text>
                <View style={styles.cChange}>{r.sales || r.prevSales ? <Delta value={r.change} small /> : <Text style={styles.td}>–</Text>}</View>
                <ChevronRight size={16} color={Colors.textSubtle} />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity key={r.id} style={[styles.row, !last && styles.divider]} onPress={() => onOpenStore(r.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${r.name}, ${formatMoneyCompact(r.sales)} sales`}>
              <View style={styles.rowTop}>
                <Text style={styles.rank}>{rank ?? '–'}</Text>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                  </Text>
                </View>
                <Text style={styles.sales}>{formatMoneyCompact(r.sales)}</Text>
              </View>
              <View style={styles.rowBar}>
                <View style={styles.track}>
                  <View style={[styles.bar, { width: barWidth as any }]} />
                </View>
                <Text style={styles.sharePct}>{formatPercent(share, 0)}</Text>
              </View>
              <View style={styles.rowBottom}>
                <Text style={styles.sub} numberOfLines={1}>
                  {r.orders} order{r.orders === 1 ? '' : 's'}
                  {r.orders ? ` · avg ${formatMoneyCompact(avg)}` : ''}
                  {r.placed ? ` · ${formatPercent(r.cancelRate, 0)} cancelled` : ''}
                  {r.earnings ? ` · earned ${formatMoneyCompact(r.earnings)}` : ''}
                </Text>
                {r.sales || r.prevSales ? <Delta value={r.change} small /> : null}
              </View>
              {!r.isLive || r.flags.some((f) => f !== 'growing') ? <View style={styles.badges}>{badges}</View> : null}
            </TouchableOpacity>
          );
        })
      )}

      {/* Show more / fewer */}
      {!query && list.length > PAGE ? (
        <TouchableOpacity style={styles.more} onPress={() => setShowAll((s) => !s)} accessibilityRole="button">
          {showAll ? <ChevronUp size={16} color={Colors.primary} /> : <ChevronDown size={16} color={Colors.primary} />}
          <Text style={styles.moreText}>{showAll ? 'Show fewer' : `Show all ${list.length} stores`}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Totals */}
      {list.length > 0 ? (
        <View style={styles.totals}>
          <Text style={styles.totalsLabel}>Total ({rows.length} stores)</Text>
          <Text style={styles.totalsValue}>
            {formatMoneyCompact(totals.sales)} · {formatCount(totals.orders)} orders · Krifoo {formatMoneyCompact(totals.earnings)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { backgroundColor: Colors.background, borderRadius: 18, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: Colors.textSubtle, fontWeight: '600' },
  summary: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: 12, lineHeight: 19 },
  summaryStrong: { fontWeight: '800', color: Colors.text },

  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.cardSurface },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: Colors.text, paddingVertical: 0 },

  chips: { gap: 8, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  chipCount: { fontSize: 12, fontWeight: '800', color: Colors.textSubtle },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sortLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSubtle },
  sortOptions: { gap: 4 },
  sortOpt: { height: 28, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  sortOptActive: { backgroundColor: Colors.primaryLight },
  sortText: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  sortTextActive: { color: Colors.primaryDark },

  divider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  empty: { fontSize: 13.5, color: Colors.textMuted, paddingVertical: 14, textAlign: 'center' },

  // Phone rows
  row: { paddingVertical: 12, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 22, fontSize: 13, fontWeight: '800', color: Colors.textSubtle, textAlign: 'center' },
  name: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  sales: { fontSize: 15, fontWeight: '900', color: Colors.text },
  rowBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 32 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 32 },
  sub: { flex: 1, fontSize: 12, color: Colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 32 },
  offline: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, backgroundColor: Colors.cardSurface, paddingHorizontal: 7, height: 20, lineHeight: 20, borderRadius: 10, overflow: 'hidden' },

  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.cardSurface, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4, backgroundColor: BAR },
  sharePct: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  // Tablet table
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  tHead: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, paddingVertical: 8 },
  th: { fontSize: 11.5, fontWeight: '800', color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.3 },
  td: { fontSize: 13.5, color: Colors.text },
  tdStrong: { fontWeight: '900' },
  cRank: { width: 24, textAlign: 'center' },
  cStore: { flex: 2.2, minWidth: 0 },
  cShare: { flex: 1.6 },
  shareCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cNum: { flex: 1, textAlign: 'right' },
  cChange: { width: 80, alignItems: 'flex-end' },

  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, marginTop: 6, borderRadius: 12, backgroundColor: Colors.primaryLight },
  moreText: { fontSize: 13.5, fontWeight: '800', color: Colors.primaryDark },

  totals: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  totalsLabel: { fontSize: 13, fontWeight: '800', color: Colors.text },
  totalsValue: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
});

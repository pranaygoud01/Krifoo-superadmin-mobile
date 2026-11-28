/**
 * Filtering with honest counts ("facets").
 *
 * Every filter is a named yes/no check. `filtered` is what passes all of them. `except(key)` is
 * what passes every check except `key` — the right base for that filter's own chip counts:
 * the number on "Dine-in" is then exactly how many orders you'd see after tapping it, given the
 * date, search and every other filter already chosen. (Counting against all loaded orders made
 * the chips disagree with the list: "Dine-in 95" on a day with 71 orders.)
 */
export function facetedFilter<T, K extends string>(items: T[], checks: Record<K, (item: T) => boolean>) {
  const keys = Object.keys(checks) as K[];
  // One pass: which checks each item fails
  const failed: K[][] = items.map((item) => keys.filter((k) => !checks[k](item)));

  const filtered = items.filter((_, i) => failed[i].length === 0);
  const cache = new Map<K, T[]>();

  return {
    filtered,
    /** Items passing every check except `key`. */
    except(key: K): T[] {
      let list = cache.get(key);
      if (!list) {
        list = items.filter((_, i) => failed[i].length === 0 || (failed[i].length === 1 && failed[i][0] === key));
        cache.set(key, list);
      }
      return list;
    },
  };
}

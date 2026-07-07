export class ArrayUtils
{
    /// <summary>
    /// Groups items by key, preserving first-seen key order (like LINQ's GroupBy).
    /// </summary>
    static GroupBy<T, K>(items: readonly T[], keySelector: (item: T) => K): Array<{ key: K; values: T[] }> {
        const map = new Map<K, T[]>();
        for (const item of items) {
            const key = keySelector(item);
            const arr = map.get(key) || [];
            arr.push(item);
            map.set(key, arr);
        }
        const result: Array<{ key: K; values: T[] }> = [];
        for (const [key, values] of map.entries()) result.push({ key, values });
        return result;
    }

    /// <summary>
    /// Returns a new array sorted ascending by key (stable, non-mutating, like LINQ's OrderBy).
    /// </summary>
    static OrderBy<T, K>(items: readonly T[], keySelector: (item: T) => K): T[] {
        return [...items].sort((a, b) => {
            const ka = keySelector(a), kb = keySelector(b);
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
    }

    /// <summary>
    /// Returns a new array sorted descending by key (stable, non-mutating, like LINQ's OrderByDescending).
    /// </summary>
    static OrderByDescending<T, K>(items: readonly T[], keySelector: (item: T) => K): T[] {
        return [...items].sort((a, b) => {
            const ka = keySelector(a), kb = keySelector(b);
            return ka > kb ? -1 : ka < kb ? 1 : 0;
        });
    }
}

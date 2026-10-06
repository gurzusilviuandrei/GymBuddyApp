// Reading a whole table through the Supabase API. The server returns at most a fixed
// number of rows per request (1,000 by default), so a plain `select()` of a big table
// is silently cut short. These helpers count first, then read page by page until every
// row has arrived, and fail loudly rather than return a partial result. They don't
// assume the server's cap: a short page just means "keep going from here".

export const PAGE_SIZE = 1000;

export type PageResult<T> = { data: T[] | null; error: unknown };

/** Reads rows [from, to] (inclusive). Must use a stable order so pages don't overlap. */
export type PageReader<T> = (from: number, to: number) => PromiseLike<PageResult<T>>;

export class IncompleteReadError extends Error {
  constructor(
    public readonly got: number,
    public readonly expected: number,
  ) {
    super(`Read ${got} of ${expected} rows`);
    this.name = "IncompleteReadError";
  }
}

/** Collect `total` rows, one page at a time. Throws if the server stops returning rows early. */
export async function fetchAllPages<T>(total: number, readPage: PageReader<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < total) {
    const { data, error } = await readPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) throw new IncompleteReadError(rows.length, total);
    rows.push(...data);
  }
  return rows;
}

/** Every row of a table: exact count first, then pages. */
export async function readEntireTable<T>(
  count: () => PromiseLike<{ count: number | null; error: unknown }>,
  readPage: PageReader<T>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const { count: total, error } = await count();
  if (error || total === null) throw error ?? new Error("Could not count rows");
  return fetchAllPages(total, readPage, pageSize);
}

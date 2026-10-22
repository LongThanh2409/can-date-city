export const RETENTION_DAYS = 5

export function datesToDelete(dates: string[], keep = RETENTION_DAYS): string[] {
  const unique = [...new Set(dates)].sort((a, b) => b.localeCompare(a))
  return unique.slice(keep)
}

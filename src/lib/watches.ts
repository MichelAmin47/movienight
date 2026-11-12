import type { WatchFormValues } from '../components/WatchForm'
import { supabase } from './supabase'

function ratingRows(watchId: string, scores: Record<string, number>) {
  return Object.entries(scores).map(([person_id, score]) => ({ watch_id: watchId, person_id, score }))
}

/** Inserts a watch with its ratings. The movie must already exist in `movies`. */
export async function createWatch(householdId: string, tmdbId: number, values: WatchFormValues): Promise<string> {
  const watch = await supabase
    .from('watches')
    .insert({
      household_id: householdId,
      tmdb_id: tmdbId,
      watched_on: values.watchedOn,
      note: values.note.trim() || null,
    })
    .select('id')
    .single()
  if (watch.error) throw watch.error

  const rows = ratingRows(watch.data.id, values.scores)
  if (rows.length) {
    const ratings = await supabase.from('ratings').insert(rows)
    if (ratings.error) throw ratings.error
  }
  return watch.data.id
}

/** Updates date and note, upserts the given scores and removes scores that were cleared. */
export async function updateWatch(watchId: string, values: WatchFormValues, previousPersonIds: string[]) {
  const watch = await supabase
    .from('watches')
    .update({ watched_on: values.watchedOn, note: values.note.trim() || null })
    .eq('id', watchId)
  if (watch.error) throw watch.error

  const rows = ratingRows(watchId, values.scores)
  if (rows.length) {
    const ratings = await supabase.from('ratings').upsert(rows)
    if (ratings.error) throw ratings.error
  }
  const removed = previousPersonIds.filter((id) => !(id in values.scores))
  if (removed.length) {
    const cleared = await supabase.from('ratings').delete().eq('watch_id', watchId).in('person_id', removed)
    if (cleared.error) throw cleared.error
  }
}

export async function deleteWatch(watchId: string) {
  const { error } = await supabase.from('watches').delete().eq('id', watchId)
  if (error) throw error
}

/**
 * Inserts many undated watches ("watched earlier") with their ratings in two
 * requests. Every movie must already exist in `movies`, and each movie may
 * appear only once in `entries`.
 */
export async function createUndatedWatches(
  householdId: string,
  entries: { tmdbId: number; scores: Record<string, number> }[],
) {
  if (entries.length === 0) return
  const watches = await supabase
    .from('watches')
    // watched_on is sent as an explicit null; leaving it out would default to today.
    .insert(entries.map((entry) => ({ household_id: householdId, tmdb_id: entry.tmdbId, watched_on: null })))
    .select('id, tmdb_id')
  if (watches.error) throw watches.error

  const watchIdByMovie = new Map(watches.data.map((w) => [w.tmdb_id, w.id]))
  const rows = entries.flatMap((entry) => ratingRows(watchIdByMovie.get(entry.tmdbId)!, entry.scores))
  if (rows.length) {
    const ratings = await supabase.from('ratings').insert(rows)
    if (ratings.error) throw ratings.error
  }
}

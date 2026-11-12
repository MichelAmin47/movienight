/**
 * Hand-written from the SQL files in supabase/migrations, in the shape
 * `supabase gen types` would produce. Keep in sync with the schema manually.
 */
export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: { id?: string; name?: string; created_at?: string }
        Relationships: []
      }
      household_members: {
        Row: { household_id: string; user_id: string; created_at: string }
        Insert: { household_id: string; user_id: string; created_at?: string }
        Update: { household_id?: string; user_id?: string; created_at?: string }
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      people: {
        Row: {
          id: string
          household_id: string
          name: string
          emoji: string | null
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          emoji?: string | null
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          emoji?: string | null
          color?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'people_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      movies: {
        Row: {
          tmdb_id: number
          title: string
          original_title: string | null
          year: number | null
          poster_path: string | null
          genre_ids: number[]
          runtime: number | null
          certification_nl: string | null
          overview: string | null
          cached_at: string
        }
        Insert: {
          tmdb_id: number
          title: string
          original_title?: string | null
          year?: number | null
          poster_path?: string | null
          genre_ids?: number[]
          runtime?: number | null
          certification_nl?: string | null
          overview?: string | null
          cached_at?: string
        }
        Update: {
          tmdb_id?: number
          title?: string
          original_title?: string | null
          year?: number | null
          poster_path?: string | null
          genre_ids?: number[]
          runtime?: number | null
          certification_nl?: string | null
          overview?: string | null
          cached_at?: string
        }
        Relationships: []
      }
      watches: {
        Row: {
          id: string
          household_id: string
          tmdb_id: number
          /** Null means "watched at some unknown earlier date". */
          watched_on: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          tmdb_id: number
          watched_on?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          tmdb_id?: number
          watched_on?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'watches_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'watches_tmdb_id_fkey'
            columns: ['tmdb_id']
            isOneToOne: false
            referencedRelation: 'movies'
            referencedColumns: ['tmdb_id']
          },
        ]
      }
      ratings: {
        Row: { watch_id: string; person_id: string; score: number; created_at: string }
        Insert: { watch_id: string; person_id: string; score: number; created_at?: string }
        Update: { watch_id?: string; person_id?: string; score?: number; created_at?: string }
        Relationships: [
          {
            foreignKeyName: 'ratings_watch_id_fkey'
            columns: ['watch_id']
            isOneToOne: false
            referencedRelation: 'watches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ratings_person_id_fkey'
            columns: ['person_id']
            isOneToOne: false
            referencedRelation: 'people'
            referencedColumns: ['id']
          },
        ]
      }
      dismissed: {
        Row: { household_id: string; tmdb_id: number; created_at: string }
        Insert: { household_id: string; tmdb_id: number; created_at?: string }
        Update: { household_id?: string; tmdb_id?: number; created_at?: string }
        Relationships: [
          {
            foreignKeyName: 'dismissed_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_household: { Args: { household_name: string }; Returns: string }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      ping: { Args: Record<PropertyKey, never>; Returns: number }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type Tables = Database['public']['Tables']
export type Household = Tables['households']['Row']
export type HouseholdMember = Tables['household_members']['Row']
export type Person = Tables['people']['Row']
export type Movie = Tables['movies']['Row']
export type MovieInsert = Tables['movies']['Insert']
export type Watch = Tables['watches']['Row']
export type Rating = Tables['ratings']['Row']

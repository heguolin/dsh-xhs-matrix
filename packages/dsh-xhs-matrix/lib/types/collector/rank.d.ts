import type { Account, Persona, PublishedNote } from '../types.ts';
import type { NormalizedViral, RankedViral } from './provider.ts';
export declare function rankViralItems(account: Account, persona: Persona, notes: PublishedNote[], items: NormalizedViral[]): RankedViral[];

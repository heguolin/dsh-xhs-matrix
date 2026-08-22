/** 爆款候选排序：人设归属，跨账号共享知识库作为参考，不再按账号过滤。 */
import type { Persona, PublishedNote } from '../types.ts';
import type { NormalizedViral, RankedViral } from './provider.ts';
export declare function rankViralItems(persona: Persona, notes: PublishedNote[], items: NormalizedViral[]): RankedViral[];

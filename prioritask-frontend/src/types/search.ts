import type { Task } from "./task";

export interface SearchResultItem {
  task: Task;
  relevance_score: number;
  matched_fields: string[];
}

export interface TaskSearchResponse {
  total_matches: number;
  results: SearchResultItem[];
}

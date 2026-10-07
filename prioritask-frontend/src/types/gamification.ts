export interface LeaderboardEntry {
  user_id: string;
  nombre: string;
  points_balance: number;
  lifetime_points: number;
  current_streak: number;
  level: number;
}

export interface GamificationOverview {
  user_balance: number;
  user_current_streak: number;
  user_longest_streak: number;
  streak_freeze_available: number;
  last_completed_date: string | null;
  leaderboard: LeaderboardEntry[];
}

export interface RewardCreate {
  title: string;
  description?: string;
  cost_points: number;
  icon_name?: string;
}

export interface RewardRead {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  cost_points: number;
  icon_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RedemptionRead {
  id: string;
  reward_id: string;
  room_id: string;
  user_id: string;
  status: string;
  points_spent: number;
  created_at: string;
}

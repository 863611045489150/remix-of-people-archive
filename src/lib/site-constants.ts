export const CATEGORIES = [
  "Best Friend",
  "Close Female Friends",
  "Close Male Friends",
  "Just Friends",
  "Inspirational Friends",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type FriendRow = {
  id: string;
  name: string;
  category: Category;
  photo_url: string;
  quote: string | null;
  instagram_url: string;
  sort_order: number;
  created_at: string;
};

export type SiteSettings = {
  id: number;
  hero_name: string;
  hero_tagline: string;
  hero_photo_url: string | null;
  stat_label: string;
  profile_url: string;
};
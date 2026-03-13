export const POST_STATUS_VALUES = ["draft", "published"] as const;

export const POST_FILTER_VALUES = ["all", ...POST_STATUS_VALUES] as const;

export const POSTS_PAGE_SIZE = 6;

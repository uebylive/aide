// Convert unix timestamp to example: 6h ago — 3 Aug 2023, 8:46pm.
// Ensure the relative time part shows only one unit of time.
export const appendLocaleTime = (relativeTime: string, time: Date) => {
  return `${relativeTime} — ${time.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  })}`;
};

export const makeTimestampHumanReadable = (unixTime: number): string => {
  const time = new Date(unixTime * 1000);
  const now = new Date();
  const diff = now.getTime() - time.getTime();
  const diffSeconds = Math.floor(diff / 1000);
  const diffMinutes = Math.floor(diff / 60000);
  const diffHours = Math.floor(diff / 3600000);
  const diffDays = Math.floor(diff / 86400000);
  const diffMonths = Math.floor(diff / 2592000000);
  const diffYears = Math.floor(diff / 31536000000);

  // Ensure pluralization is correct. For example, 1 day ago, 2 days ago.
  if (diffYears > 0) {
    return appendLocaleTime(`${diffYears} year${diffYears > 1 ? "s" : ""} ago`, time);
  }

  if (diffMonths > 0) {
    return appendLocaleTime(`${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`, time);
  }

  if (diffDays > 0) {
    return appendLocaleTime(`${diffDays} day${diffDays > 1 ? "s" : ""} ago`, time);
  }

  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
  }

  if (diffSeconds > 0) {
    return `${diffSeconds} second${diffSeconds > 1 ? "s" : ""} ago`;
  }

  return appendLocaleTime("just now", time);
};

import type { Role, User } from "@/types";
import { isoHoursFromAnchor } from "@/lib/utils/date";

/**
 * DEMO ACCOUNTS — FICTIONAL, AND OBVIOUSLY SO.
 *
 * Demo builds only (see `lib/demo/runtime.demo.ts`). Names are role labels,
 * emails use the reserved `.invalid` domain, and location ids name demo
 * locations that are not on the production roster. Nothing here describes a
 * real Buff City Soap person or store.
 */
function demoUser(
  id: string,
  name: string,
  role: Role,
  scope: User["scope"],
  title: string,
  hoursAgo: number,
): User {
  return {
    id,
    name,
    email: `${id}@demo.invalid`,
    role,
    scope,
    isLocationAccount: false,
    active: true,
    avatarInitials: name
      .split(" ")
      .map((word) => word[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    title,
    lastActiveAt: isoHoursFromAnchor(-hoursAgo),
    createdAt: "2026-09-01T15:00:00.000Z",
  };
}

const GLOBAL = { level: "global" as const, primaryAreaId: null, alsoCoversAreaIds: [] };

export const DEMO_USERS: User[] = [
  demoUser("demo-owner", "Demo Owner", "owner", GLOBAL, "Owner (demo)", 2),
  demoUser("demo-developer", "Demo Developer", "developer", GLOBAL, "Developer (demo)", 6),
  demoUser(
    "demo-regional",
    "Demo Regional Manager",
    "regional_manager",
    { level: "region", primaryAreaId: "reg-demo", alsoCoversAreaIds: [] },
    "Regional Manager (demo)",
    20,
  ),
  demoUser(
    "demo-district",
    "Demo District Manager",
    "district_manager",
    { level: "district", primaryAreaId: "dist-demo", alsoCoversAreaIds: [] },
    "District Manager (demo)",
    4,
  ),
  demoUser(
    "demo-location",
    "Demo Location Manager",
    "location_manager",
    { level: "location", primaryAreaId: "loc-demo-1", alsoCoversAreaIds: [] },
    "Location Manager (demo)",
    1,
  ),
  demoUser(
    "demo-assistant",
    "Demo Assistant Manager",
    "assistant_manager",
    { level: "location", primaryAreaId: "loc-demo-1", alsoCoversAreaIds: [] },
    "Assistant Manager (demo)",
    9,
  ),
  demoUser(
    "demo-team-member",
    "Demo Team Member",
    "employee",
    { level: "location", primaryAreaId: "loc-demo-1", alsoCoversAreaIds: [] },
    "Team Member (demo)",
    12,
  ),
];

/** Whose account the demo signs in as for each "Demo role" selection. */
export const DEMO_ROLE_ACCOUNTS: Record<Role, string> = {
  employee: "demo-team-member",
  assistant_manager: "demo-assistant",
  location_manager: "demo-location",
  district_manager: "demo-district",
  regional_manager: "demo-regional",
  admin: "demo-owner",
  owner: "demo-owner",
  developer: "demo-developer",
};

export function userById(id: string): User | undefined {
  return DEMO_USERS.find((user) => user.id === id);
}

export function userForRole(role: Role): User {
  return userById(DEMO_ROLE_ACCOUNTS[role]) ?? DEMO_USERS[0]!;
}

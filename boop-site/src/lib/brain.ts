const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL ?? "";
const BRAIN_SHARED_SECRET = process.env.BRAIN_SHARED_SECRET ?? "";

export type BrainLoreEntry = { id: string; text: string };

async function brainPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BRAIN_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BoopBot-Secret": BRAIN_SHARED_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`boop-brain ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

// NOTE: guildId/userId are Discord snowflakes — always pass as strings.
// JS numbers lose precision above 2^53; FastAPI/pydantic coerces numeric
// strings to `int` automatically, so this round-trips safely.
export const brainLoreGuildList = (guildId: string) =>
  brainPost<BrainLoreEntry[]>("/lore/guild/list", { guild_id: guildId });

export const brainLoreUserList = (userId: string) =>
  brainPost<BrainLoreEntry[]>("/lore/user/list", { user_id: userId });

export const brainLoreAdd = (guildId: string, text: string, addedByUserId: string, addedByName: string) =>
  brainPost<{ id: string | null }>("/lore/add", {
    guild_id: guildId, text, added_by_user_id: addedByUserId, added_by_name: addedByName,
  });

export const brainLoreAddMe = (userId: string, text: string) =>
  brainPost<{ id: string | null }>("/lore/addme", { user_id: userId, text });

export const brainLoreUpdate = (memoryId: string, text: string) =>
  brainPost<{ updated: boolean }>("/lore/update", { memory_id: memoryId, text });

export const brainLoreDelete = (memoryId: string) =>
  brainPost<{ deleted: boolean }>("/lore/delete", { memory_id: memoryId });

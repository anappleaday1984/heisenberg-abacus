import fs from "fs";
import path from "path";

export type Role = "admin" | "member";

export type User = {
  account: string;
  name: string;
  password: string;
  role: Role;
};

/**
 * 從環境變數 AUTH_USERS 讀取帳號清單，避免密碼進原始碼。
 * 格式：JSON array of { account, name, role, password }
 *
 * 範例（寫在 .env.local，跟 MINIMAX_API_KEY 放一起）：
 *   AUTH_USERS=[{"account":"udo","name":"管理員","role":"admin","password":"xxx"},...]
 */
function loadUsersFromEnv(): User[] {
  const raw = process.env.AUTH_USERS;
  if (!raw || !raw.trim()) {
    console.warn(
      "⚠️  AUTH_USERS 未設定 — 沒有任何帳號可以登入。請去 .env.local 設定。"
    );
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("AUTH_USERS 必須是 JSON array");
    }
    return parsed.map((p: unknown, i: number) => {
      const u = p as Record<string, unknown>;
      if (!u.account || !u.password) {
        throw new Error(`AUTH_USERS[${i}] 缺欄位 account 或 password`);
      }
      return {
        account: String(u.account),
        name: String(u.name ?? u.account),
        password: String(u.password),
        role: u.role === "admin" ? "admin" : "member",
      };
    });
  } catch (e) {
    throw new Error(
      `AUTH_USERS 解析失敗：${(e as Error).message}（請檢查 .env.local 的 JSON 格式）`
    );
  }
}

export const USERS: User[] = loadUsersFromEnv();

export type PublicUser = Omit<User, "password">;

export function toPublic(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = u;
  return rest;
}

export function findUserByAccount(account: string): User | null {
  return USERS.find((u) => u.account === account) ?? null;
}

export function validateCredentials(
  account: string,
  password: string
): User | null {
  const u = findUserByAccount(account);
  if (!u || u.password !== password) return null;
  return u;
}

// === Auth log ===
const AUTH_LOG_PATH = path.join(process.cwd(), "data", "auth-log.json");

export type AuthEvent = "login" | "logout";

export type AuthLogEntry = {
  timestamp: string;
  event: AuthEvent;
  account: string;
  name: string;
  role: Role;
};

export function appendAuthLog(entry: AuthLogEntry): void {
  const dir = path.dirname(AUTH_LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let arr: AuthLogEntry[] = [];
  if (fs.existsSync(AUTH_LOG_PATH)) {
    try {
      const raw = fs.readFileSync(AUTH_LOG_PATH, "utf-8");
      arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
    } catch {
      arr = [];
    }
  }
  arr.unshift(entry); // newest first
  fs.writeFileSync(AUTH_LOG_PATH, JSON.stringify(arr, null, 2), "utf-8");
}

export function readAuthLog(): AuthLogEntry[] {
  if (!fs.existsSync(AUTH_LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(AUTH_LOG_PATH, "utf-8")) as AuthLogEntry[];
  } catch {
    return [];
  }
}

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 小時（與 inactivity timeout 同步）

// === 同時上線人數限制 ===
// 2026-09-02：3→2，並改成「一般帳號同時最多 1 人上線、第二人登入直接擋」；
// admin（udo）不受這條限制（不佔名額、也不會擋同帳號第二次登入）。
export const MAX_CONCURRENT_USERS = 2;
export const SESSION_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 小時無動作即視為下線
export const CONCURRENT_LIMIT_MESSAGE = "目前上線人數名額已滿，請稍待片刻。";

const ACTIVE_SESSIONS_PATH = path.join(
  process.cwd(),
  "data",
  "active-sessions.json"
);

export type ActiveSession = {
  account: string;
  name: string;
  role: Role;
  loginAt: string;
  lastSeenAt: string;
};

function readActiveSessions(): ActiveSession[] {
  if (!fs.existsSync(ACTIVE_SESSIONS_PATH)) return [];
  try {
    const raw = fs.readFileSync(ACTIVE_SESSIONS_PATH, "utf-8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeActiveSessions(sessions: ActiveSession[]): void {
  const dir = path.dirname(ACTIVE_SESSIONS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    ACTIVE_SESSIONS_PATH,
    JSON.stringify(sessions, null, 2),
    "utf-8"
  );
}

function purgeExpired(sessions: ActiveSession[]): ActiveSession[] {
  const now = Date.now();
  return sessions.filter(
    (s) =>
      now - new Date(s.lastSeenAt).getTime() < SESSION_INACTIVITY_TIMEOUT_MS
  );
}

/**
 * 嘗試啟用一個 session（給 login 用）。
 *
 * - admin（udo）完全不受限制：不佔名額、同帳號可重複登入，永遠 ok=true。
 * - 一般帳號：若同帳號已在線（表示已有裝置用這組帳密登入中），第二次登入直接擋
 *   （已登入的那台裝置本來就不會再打 /login，只會靠 cookie + /api/auth/me 續命，
 *   所以這裡收到「同帳號又來 /login」幾乎可以認定是第二個人/裝置）。
 * - 一般帳號：若目前在線人數（不含 admin）已達 MAX_CONCURRENT_USERS，回傳 ok=false。
 */
export function tryActivateSession(user: User): {
  ok: boolean;
  error?: string;
  active: ActiveSession[];
} {
  const active = purgeExpired(readActiveSessions());
  const now = new Date().toISOString();

  if (user.role === "admin") {
    const existingIdx = active.findIndex((s) => s.account === user.account);
    if (existingIdx >= 0) {
      active[existingIdx] = { ...active[existingIdx], lastSeenAt: now };
    } else {
      active.push({
        account: user.account,
        name: user.name,
        role: user.role,
        loginAt: now,
        lastSeenAt: now,
      });
    }
    writeActiveSessions(active);
    return { ok: true, active };
  }

  const existingIdx = active.findIndex((s) => s.account === user.account);
  if (existingIdx >= 0) {
    return { ok: false, error: CONCURRENT_LIMIT_MESSAGE, active };
  }

  const nonAdminCount = active.filter((s) => s.role !== "admin").length;
  if (nonAdminCount >= MAX_CONCURRENT_USERS) {
    return { ok: false, error: CONCURRENT_LIMIT_MESSAGE, active };
  }

  active.push({
    account: user.account,
    name: user.name,
    role: user.role,
    loginAt: now,
    lastSeenAt: now,
  });
  writeActiveSessions(active);
  return { ok: true, active };
}

/** 登出時呼叫 — 把該帳號從在線名單移除 */
export function deactivateSession(account: string): void {
  const next = purgeExpired(readActiveSessions()).filter(
    (s) => s.account !== account
  );
  writeActiveSessions(next);
}

/** 任何 API 呼叫時呼叫，refresh lastSeenAt 避免被 timeout 踢掉 */
export function touchSession(account: string): void {
  const sessions = purgeExpired(readActiveSessions());
  const idx = sessions.findIndex((s) => s.account === account);
  if (idx >= 0) {
    sessions[idx].lastSeenAt = new Date().toISOString();
    writeActiveSessions(sessions);
  }
}

/** 給管理頁／debug 用，回傳目前在線清單（已先 purge 過期） */
export function listActiveSessions(): ActiveSession[] {
  const active = purgeExpired(readActiveSessions());
  // 順便把 purge 結果寫回，省得每次 read 都做一次
  writeActiveSessions(active);
  return active;
}

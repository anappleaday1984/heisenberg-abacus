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
export const MAX_CONCURRENT_USERS = 3;
export const SESSION_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 小時無動作即視為下線

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
 * - 若該帳號已在線，refresh lastSeenAt（同帳號重登不算多人）
 * - 若新帳號會超過 MAX_CONCURRENT_USERS，回傳 ok=false
 */
export function tryActivateSession(user: User): {
  ok: boolean;
  error?: string;
  active: ActiveSession[];
} {
  const active = purgeExpired(readActiveSessions());
  const existingIdx = active.findIndex((s) => s.account === user.account);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    active[existingIdx] = {
      ...active[existingIdx],
      lastSeenAt: now,
    };
    writeActiveSessions(active);
    return { ok: true, active };
  }

  if (active.length >= MAX_CONCURRENT_USERS) {
    const others = active.map((s) => `${s.name}(${s.account})`).join("、");
    return {
      ok: false,
      error: `已達同時上線人數上限（最多 ${MAX_CONCURRENT_USERS} 人）。目前線上：${others}。請稍後再試或請其中一位登出。`,
      active,
    };
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

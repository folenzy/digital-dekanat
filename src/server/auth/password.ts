import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2: по умолчанию argon2id с рекомендуемыми параметрами.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

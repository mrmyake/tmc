import { hash as bhash, verify as bverify } from "@node-rs/bcrypt";
export const hashPassword = (pw: string) => bhash(pw, 10);
export const verifyPassword = (hash: string, pw: string) => bverify(pw, hash);

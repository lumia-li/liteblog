import mysql from "mysql2/promise";
import { env } from "./env.ts";

export const pool = mysql.createPool({
	host: env.db.host,
	port: env.db.port,
	user: env.db.user,
	password: env.db.password,
	database: env.db.database,
	connectionLimit: env.db.poolLimit,
	enableKeepAlive: true,
	timezone: "Z",
	dateStrings: false,
});

export type UserRow = {
	id: number;
	email: string;
	username: string;
	display_name: string;
	avatar_url: string;
	password_hash: string;
	role: "admin" | "user";
	status: string;
	created_at: Date;
};

export function toPublicUser(row: UserRow) {
	return {
		id: String(row.id),
		username: row.username,
		email: row.email,
		display_name: row.display_name || row.username,
		avatar_url: row.avatar_url,
		role: row.role,
	};
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		"SELECT * FROM users WHERE email = ? LIMIT 1",
		[email],
	);
	return (rows[0] as UserRow) ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		"SELECT * FROM users WHERE username = ? LIMIT 1",
		[username],
	);
	return (rows[0] as UserRow) ?? null;
}

export async function findUserById(id: string | number): Promise<UserRow | null> {
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		"SELECT * FROM users WHERE id = ? LIMIT 1",
		[id],
	);
	return (rows[0] as UserRow) ?? null;
}

/** 建号；用户名冲突时自动追加后缀，保证唯一 */
export async function createUser(params: {
	email: string;
	username: string;
	passwordHash: string;
}): Promise<UserRow> {
	let username = params.username;
	for (let i = 0; i < 10; i++) {
		try {
			const [result] = await pool.execute<mysql.ResultSetHeader>(
				`INSERT INTO users (email, username, display_name, password_hash)
				 VALUES (?, ?, ?, ?)`,
				[params.email, username, username, params.passwordHash],
			);
			const row = await findUserById(result.insertId);
			if (!row) throw new Error("用户创建后读取失败");
			return row;
		} catch (error) {
			const code = (error as { code?: string }).code;
			if (code !== "ER_DUP_ENTRY") throw error;
			// 用户名冲突 → 追加随机后缀重试
			username = `${params.username.slice(0, 16)}_${Math.random().toString(36).slice(2, 6)}`;
		}
	}
	throw new Error("用户名生成失败，请稍后重试");
}

/** 清理过期的验证记录（每次发码时顺带执行） */
export async function purgeExpiredVerifications(): Promise<void> {
	await pool.execute("DELETE FROM email_verifications WHERE expires_at < NOW()");
}

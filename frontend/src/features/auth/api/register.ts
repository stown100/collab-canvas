'use server';

import bcrypt from 'bcryptjs';
import pool from '@/shared/lib/postgres/client';

type RegisterInput = {
  email: string;
  password: string;
};

type RegisterResult = { ok: true } | { ok: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email?.toLowerCase().trim();
  const password = input.password ?? '';

  if (!email || !EMAIL_REGEX.test(email)) return { ok: false, error: 'Введите корректный email' };
  if (password.length < 8) return { ok: false, error: 'Пароль должен быть не менее 8 символов' };

  // Reject if the email is already taken (by a password or OAuth account)
  // to prevent hijacking an existing OAuth-only account.
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return { ok: false, error: 'Пользователь с таким email уже существует' };
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (email, password) VALUES ($1, $2)',
    [email, hashedPassword],
  );

  return { ok: true };
}

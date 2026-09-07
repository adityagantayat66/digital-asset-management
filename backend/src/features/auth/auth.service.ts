import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { HttpStatus } from '../../utils/httpStatus';
import { AuthUserResult, UserProfileData, RegisterUserData, LoginUserData } from './auth.models';

export async function registerUser(data: RegisterUserData): Promise<AuthUserResult> {
  const { email, password, name, role } = data;

  // 1. Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error: any = new Error('User with this email already exists');
    error.statusCode = HttpStatus.CONFLICT;
    throw error;
  }

  // 2. Hash password with bcrypt
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. Create user in PostgreSQL
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: role || Role.USER,
    },
  });

  // 4. Generate JWT Token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export async function loginUser(data: LoginUserData): Promise<AuthUserResult> {
  const { email, password } = data;

  // 1. Find user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const error: any = new Error('Invalid email or password');
    error.statusCode = HttpStatus.UNAUTHORIZED;
    throw error;
  }

  // 2. Verify password hash
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    const error: any = new Error('Invalid email or password');
    error.statusCode = HttpStatus.UNAUTHORIZED;
    throw error;
  }

  // 3. Generate JWT Token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export async function getUserProfile(userId: string): Promise<UserProfileData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    const error: any = new Error('User profile not found');
    error.statusCode = HttpStatus.NOT_FOUND;
    throw error;
  }

  return user;
}

import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../services/prisma';
import { env } from '../../config/env';
import { HttpStatus } from '../../utils/httpStatus';
import { AuthUserResult, UserProfileData, RegisterUserData, LoginUserData } from './auth.models';

/**
 * @Description Registers a new user in PostgreSQL, hashes their password with bcrypt, and issues a JWT token.
 * @Params data (RegisterUserData) - Object containing email, password, name, and optional role
 * @Returns Promise<AuthUserResult> - Generated JWT token and created user metadata
 */
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

/**
 * @Description Validates user credentials against PostgreSQL password hash and generates an Access Token.
 * @Params data (LoginUserData) - Object containing email and password credentials
 * @Returns Promise<AuthUserResult> - JWT access token and user metadata
 */
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

/**
 * @Description Retrieves public user profile details by user ID from PostgreSQL.
 * @Params userId (string) - User UUID identifier
 * @Returns Promise<UserProfileData> - User profile record
 */
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

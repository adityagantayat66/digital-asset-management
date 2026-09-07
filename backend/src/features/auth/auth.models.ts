import { Role } from '@prisma/client';

export interface RegisterUserData {
  email: string;
  password: string;
  name: string;
  role?: Role;
}

export interface LoginUserData {
  email: string;
  password: string;
}

export interface AuthUserInfo {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthUserResult {
  token: string;
  user: AuthUserInfo;
}

export interface UserProfileData {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

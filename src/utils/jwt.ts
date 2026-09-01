import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type JwtPayload = {
  userId: string;
  username: string;
  role: string;
};

export const signToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: '8h' });

export const verifyToken = (token: string) =>
  jwt.verify(token, env.jwtSecret) as JwtPayload;
